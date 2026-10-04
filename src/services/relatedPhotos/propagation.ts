import { randomUUID } from 'node:crypto';
import type { DatabaseManager } from '../../data/db';
import { analysisClaimSchema, dateValueSchema, type AnalysisClaim, type AnalysisSource, type StoredAnalysisClaim } from '../../shared/photoAnalysis/contracts';
import { loadAnalysis, persistAnalysisRun } from '../photoAnalysis/repository';
import { capEvidenceConfidence } from '../photoAnalysis/lineage';
import { assessPhotoLink } from './candidates';
import { loadEventMembers, type EventMember, type PhotoEvent } from './events';
import type { MembershipAssessment } from '../../shared/relatedPhotos';
import { analysisValiditySql } from '../../shared/sql/analysisValidity';

type Field = 'date' | 'location';
type Anchor = { claim: StoredAnalysisClaim; member: EventMember; confidence: AnalysisClaim['confidence']; linkClaimIds: string[] };
type Inference = { value: AnalysisClaim['value']; confidence: AnalysisClaim['confidence']; anchors: Anchor[]; conflict: boolean };
type PropagationPlan = { target: EventMember; field: Field; authoritative: boolean; inference: Inference | null; previous?: StoredAnalysisClaim };
type PlanningContext = {
    manager: DatabaseManager;
    snapshots: Map<string, ReturnType<typeof loadAnalysis>>;
    accepted: Set<string>;
    links: Map<string, MembershipAssessment | null>;
    currentClaimIds: Map<string, boolean>;
};

function directlyAnchored(claim: StoredAnalysisClaim, field: Field): boolean {
    return claim.field === field && claim.subjectId === null && claim.value !== null
        && (claim.kind === 'known_fact' || claim.kind === 'user_confirmed') && claim.state === 'active';
}

function memberIsStrong(member: EventMember): boolean {
    return member.state === 'active' && ['strong', 'anchored', 'conflicting'].includes(member.role);
}

function acceptedMembership(manager: DatabaseManager, member: EventMember): boolean {
    const decision = manager.getDb().prepare(`SELECT disposition FROM photo_event_decisions
        WHERE event_id = ? AND asset_id = ? ORDER BY rowid DESC LIMIT 1`).get(member.eventId, member.assetId) as { disposition: string } | undefined;
    return decision?.disposition === 'confirmed';
}

function linkClaimIds(context: PlanningContext, sourceIds: string[]): string[] {
    const current = context.manager.getDb().prepare("SELECT id FROM analysis_claims WHERE id = ? AND state = 'active'");
    return [...new Set(sourceIds)].filter(id => {
        if (!context.currentClaimIds.has(id)) { context.currentClaimIds.set(id, Boolean(current.get(id))); }
        return context.currentClaimIds.get(id);
    });
}

function collectAnchors(context: PlanningContext, target: EventMember, members: EventMember[], field: Field): Anchor[] {
    return members.filter(memberIsStrong).flatMap(member => memberAnchors(context, target, member, field));
}

function planningLink(context: PlanningContext, targetId: string, memberId: string): MembershipAssessment | null {
    const key = JSON.stringify([targetId, memberId].sort());
    if (!context.links.has(key)) { context.links.set(key, assessPhotoLink(context.manager, targetId, memberId)); }
    return context.links.get(key) ?? null;
}

function memberAnchors(context: PlanningContext, target: EventMember, member: EventMember, field: Field): Anchor[] {
    const claims = context.snapshots.get(member.assetId)!.winners.filter(claim => directlyAnchored(claim, field));
    if (claims.length === 0) { return []; }
    if (member.assetId === target.assetId) {
        return claims.map(claim => ({ claim, member, confidence: claim.confidence, linkClaimIds: [] }));
    }
    const support = peerMembershipSupport(context, target, member);
    if (!support) { return []; }
    return claims.map(claim => ({ claim, member, linkClaimIds: support.roots,
        confidence: capEvidenceConfidence(claim.confidence, [target.confidence, member.confidence, support.confidence]) }));
}

function peerMembershipSupport(context: PlanningContext, target: EventMember, member: EventMember) {
    const confirmed = context.accepted.has(member.assetId) && context.accepted.has(target.assetId);
    if (confirmed) { return { roots: [], confidence: 'high' as const }; }
    const link = planningLink(context, target.assetId, member.assetId);
    if (link?.role !== 'strong') { return null; }
    return { roots: linkClaimIds(context, link.evidence.flatMap(item => item.sourceIds)), confidence: link.confidence };
}

function compatibleDate(a: AnalysisClaim['value'], b: AnalysisClaim['value']): boolean {
    const left = dateValueSchema.safeParse(a);
    const right = dateValueSchema.safeParse(b);
    if (!left.success || !right.success) { return false; }
    const x = left.data;
    const y = right.data;
    if (x.start && x.end && y.start && y.end) { return x.start <= y.end && y.start <= x.end; }
    return x.label.trim().toLowerCase() === y.label.trim().toLowerCase();
}

function compatibleLocation(a: AnalysisClaim['value'], b: AnalysisClaim['value']): boolean {
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || !('label' in a) || !('label' in b)) { return false; }
    return String(a.label).trim().toLowerCase() === String(b.label).trim().toLowerCase();
}

function chooseInference(anchors: Anchor[], field: Field): Inference | null {
    if (anchors.length === 0) { return null; }
    const compatible = field === 'date' ? compatibleDate : compatibleLocation;
    const first = anchors[0].claim.value;
    const conflict = anchors.some((anchor, index) => anchors.slice(index + 1)
        .some(other => !compatible(anchor.claim.value, other.claim.value)));
    return { value: conflict ? null : first, confidence: conflict ? 'unknown' : capEvidenceConfidence('high', anchors.map(anchor => anchor.confidence)), anchors, conflict };
}

function inferenceSource(event: PhotoEvent, target: EventMember, inference: Inference): AnalysisSource {
    const rootClaimIds = inferenceRootIds(inference);
    const members = new Map([target, ...inference.anchors.map(anchor => anchor.member)].map(member => [member.assetId, member]));
    return { id: `network:${randomUUID()}`, assetId: target.assetId, kind: 'related_photo', refId: event.id,
        text: inference.conflict ? 'Related event has incompatible direct anchors; review or split membership.' : 'Related-photo inference from direct anchors and independently supported event membership.',
        rootClaimIds, memberships: [...members.values()].map(member => ({ eventId: event.id, assetId: member.assetId, revision: member.revision })) };
}

function inferenceRootIds(inference: Inference): string[] {
    return [...new Set(inference.anchors.flatMap(anchor => [anchor.claim.id, ...anchor.linkClaimIds]))].sort();
}

function retireNetworkClaims(manager: DatabaseManager, assetId: string, field: Field): void {
    manager.getDb().prepare(`UPDATE analysis_claims SET state = 'superseded' WHERE asset_id = ? AND field = ?
        AND state = 'active' AND run_id IN (SELECT id FROM analysis_runs WHERE provider = 'related-photo-network')`)
        .run(assetId, field);
}

function inferenceUnchanged(manager: DatabaseManager, previous: StoredAnalysisClaim | undefined, inference: Inference): boolean {
    if (!previous || JSON.stringify(previous.value) !== JSON.stringify(inference.value) || previous.confidence !== inference.confidence) { return false; }
    const current = manager.getDb().prepare(`SELECT 1 FROM analysis_claims claim
        WHERE claim.id = ? AND claim.state = 'active' AND ${analysisValiditySql('claim')}`).get(previous.id);
    if (!current) { return false; }
    const roots = manager.getDb().prepare('SELECT DISTINCT root_claim_id FROM analysis_claim_roots WHERE claim_id = ? ORDER BY root_claim_id')
        .all(previous.id) as { root_claim_id: string }[];
    return JSON.stringify(roots.map(root => root.root_claim_id)) === JSON.stringify(inferenceRootIds(inference));
}

function persistInference(manager: DatabaseManager, event: PhotoEvent, plan: PropagationPlan): void {
    const { target, field } = plan;
    const inference = plan.authoritative ? null : plan.inference;
    if (inference && inferenceUnchanged(manager, plan.previous, inference)) { return; }
    retireNetworkClaims(manager, target.assetId, field);
    if (!inference) { return; }
    const source = inferenceSource(event, target, inference);
    const evidenceText = inference.conflict ? 'Reliable related photographs disagree on this field.'
        : `Direct ${field} anchor from ${inference.anchors[0].member.assetId}; ${target.evidence.map(item => item.text).slice(0, 2).join('; ')}`;
    const claim = analysisClaimSchema.parse({ field, subjectId: null, value: inference.value, confidence: inference.confidence, kind: 'inferred_conclusion',
        evidence: [{ text: evidenceText.slice(0, 180), sourceIds: [source.id] }],
        contradictions: inference.conflict ? [{ text: 'Incompatible direct anchors; no value selected.', sourceIds: [source.id] }] : [],
        sourceIds: [source.id], supersedesId: null });
    persistAnalysisRun(manager, { assetId: target.assetId, stage: 'context', provider: 'related-photo-network',
        modelVersion: null, promptVersion: 'related-photo-1', sources: [source],
        result: { claims: [claim], regions: [], refinementOpportunities: [] } });
}

function createPropagationPlans(manager: DatabaseManager, members: EventMember[]): PropagationPlan[] {
    const context: PlanningContext = {
        manager, snapshots: new Map(members.map(member => [member.assetId, loadAnalysis(manager, member.assetId)])),
        accepted: new Set(members.filter(member => acceptedMembership(manager, member)).map(member => member.assetId)),
        links: new Map(), currentClaimIds: new Map() };
    return members.flatMap(target => (['date', 'location'] as const).map(field => {
        const snapshot = context.snapshots.get(target.assetId)!;
        const authoritative = snapshot.winners.some(claim => claim.field === field
            && (claim.kind === 'known_fact' || claim.kind === 'user_confirmed'));
        const inference = memberIsStrong(target) ? chooseInference(collectAnchors(context, target, members, field), field) : null;
        const previous = snapshot.claims.find(claim => claim.field === field && claim.state === 'active' && claim.provider === 'related-photo-network');
        return { target, field, authoritative, inference, previous };
    }));
}

/** Change membership revisions before writing claims so newly saved dependencies are current. */
function synchronizeConflictRoles(manager: DatabaseManager, members: EventMember[], plans: PropagationPlan[]): void {
    const conflicting = new Set(plans.filter(plan => plan.inference?.conflict)
        .flatMap(plan => [plan.target.assetId, ...plan.inference!.anchors.map(anchor => anchor.member.assetId)]));
    for (const member of members.filter(memberIsStrong)) {
        const ownAnchor = plans.some(plan => plan.target === member && plan.inference?.anchors
            .some(anchor => anchor.member === member && anchor.claim.confidence === 'high'));
        const role = resolvedMemberRole(conflicting.has(member.assetId), ownAnchor);
        if (member.role === role) { continue; }
        manager.getDb().prepare(`UPDATE photo_event_members SET role = ?, revision = revision + 1
            WHERE event_id = ? AND asset_id = ?`).run(role, member.eventId, member.assetId);
        member.role = role;
        member.revision += 1;
    }
}

function resolvedMemberRole(conflicting: boolean, anchored: boolean): EventMember['role'] {
    if (conflicting) { return 'conflicting'; }
    return anchored ? 'anchored' : 'strong';
}

function resolvedEventState(members: EventMember[], conflicting: boolean): PhotoEvent['state'] {
    if (conflicting) { return 'conflicted'; }
    return members.some(member => member.role === 'anchored') ? 'supported' : 'proposed';
}

function eventConfidence(members: EventMember[], plans: PropagationPlan[], conflicting: boolean): AnalysisClaim['confidence'] {
    if (conflicting) { return 'unknown'; }
    const support = plans.flatMap(plan => plan.inference ? [plan.inference.confidence] : []);
    if (support.length === 0) { return 'low'; }
    return capEvidenceConfidence('high', [...support, ...members.filter(memberIsStrong).map(member => member.confidence)]);
}

/** Propagates only direct roots over direct supported links. Derived neighbours cannot become anchors. */
export function propagateEventEvidence(manager: DatabaseManager, event: PhotoEvent): { assetIds: string[]; conflicting: boolean } {
    const members = loadEventMembers(manager, event.id);
    const db = manager.getDb();
    const plans = createPropagationPlans(manager, members);
    const conflicting = plans.some(plan => plan.inference?.conflict);
    db.transaction(() => {
        synchronizeConflictRoles(manager, members, plans);
        for (const plan of plans) { persistInference(manager, event, plan); }
        const state = resolvedEventState(members, conflicting);
        db.prepare(`UPDATE photo_events SET state = ?, confidence = ?, updated_at = ? WHERE id = ?`)
            .run(state, eventConfidence(members, plans, conflicting), new Date().toISOString(), event.id);
    })();
    return { assetIds: members.map(member => member.assetId), conflicting };
}
