import type { DatabaseManager } from '../../data/db';
import type { RefinementTarget } from '../../shared/photoAnalysis/contracts';
import { loadAnalysis } from '../photoAnalysis/repository';
import { loadEventMembers, type EventMember, type PhotoEvent } from './events';
import { buildFamilyIdentityContext } from './identityContext';

type Db = ReturnType<DatabaseManager['getDb']>;
type Opportunity = { target: RefinementTarget; contextKey: string };

function updateOpportunity(db: Db, assetId: string, opportunity: Opportunity): boolean {
    const { target, contextKey } = opportunity;
    return db.prepare(`INSERT INTO related_refinement_opportunities(asset_id, field, subject_id, context_key, targets_json, state)
        VALUES (?, ?, ?, ?, ?, 'pending') ON CONFLICT(asset_id, field, subject_id) DO UPDATE SET
        context_key = excluded.context_key, targets_json = excluded.targets_json, state = 'pending'
        WHERE related_refinement_opportunities.context_key <> excluded.context_key`)
        .run(assetId, target.field, target.subjectId ?? '', contextKey, JSON.stringify(target)).changes > 0;
}

function fieldOpportunities(manager: DatabaseManager, member: EventMember): Opportunity[] {
    if (member.state !== 'active') { return []; }
    const analysis = loadAnalysis(manager, member.assetId);
    const targets: Opportunity[] = [];
    for (const field of ['date', 'location'] as const) {
        const winner = analysis.winners.find(claim => claim.field === field && claim.subjectId === null);
        if (winner && (['known_fact', 'user_confirmed'].includes(winner.kind)
            || (winner.value !== null && ['high', 'medium'].includes(winner.confidence)))) { continue; }
        const roots = manager.getDb().prepare(`SELECT claim.id, peer.asset_id, peer.revision
            FROM photo_event_members peer JOIN photo_analysis_winners claim ON claim.asset_id = peer.asset_id
            WHERE peer.event_id = ? AND peer.state = 'active' AND peer.asset_id <> ? AND claim.field = ?
              AND claim.subject_id IS NULL AND claim.kind IN ('known_fact','user_confirmed') AND claim.value_json <> 'null'
            ORDER BY claim.id LIMIT 64`).all(member.eventId, member.assetId, field);
        if (roots.length === 0) { continue; }
        targets.push({ target: { field, subjectId: null, concern: field,
            question: `Does the new event evidence resolve this ${field}, or contradict the membership?` },
            contextKey: JSON.stringify([member.eventId, member.revision, roots]) });
    }
    return targets;
}

function identityOpportunities(manager: DatabaseManager, member: EventMember): Opportunity[] {
    if (member.state !== 'active' || member.role === 'possible' || member.role === 'conflicting') { return []; }
    const candidates = manager.getDb().prepare(`SELECT candidate.face_id, candidate.person_id, candidate.root_claim_ids_json,
        candidate.evidence_json FROM related_face_candidates candidate JOIN faces face ON face.id = candidate.face_id
        JOIN visual_regions region ON region.id = face.visual_region_id
        JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid
        WHERE asset.id = ? AND candidate.event_id = ? ORDER BY candidate.face_id, candidate.person_id LIMIT 20`)
        .all(member.assetId, member.eventId) as { face_id: string; person_id: string; root_claim_ids_json: string; evidence_json: string }[];
    const groups = new Map<string, typeof candidates>();
    for (const row of candidates) { groups.set(row.face_id, [...(groups.get(row.face_id) ?? []), row]); }
    return [...groups].map(([faceId, evidence]) => ({ target: { field: 'identity', subjectId: faceId, concern: 'identity',
        question: 'Compare bounded identity candidates with new confirmed event context; preserve independent visual age.' },
        contextKey: JSON.stringify([member.eventId, evidence]) }));
}

function withdrawResolvedOpportunities(db: Db, assetId: string, targets: Opportunity[]): void {
    const activeKeys = new Set(targets.map(({ target }) => JSON.stringify([target.field, target.subjectId ?? ''])));
    const previous = db.prepare(`SELECT field, subject_id FROM related_refinement_opportunities WHERE asset_id = ? AND state = 'pending'`)
        .all(assetId) as { field: string; subject_id: string }[];
    for (const row of previous) {
        if (activeKeys.has(JSON.stringify([row.field, row.subject_id]))) { continue; }
        db.prepare(`UPDATE related_refinement_opportunities SET state = 'withdrawn' WHERE asset_id = ? AND field = ? AND subject_id = ?`)
            .run(assetId, row.field, row.subject_id);
    }
}

function familyOpportunities(manager: DatabaseManager, assetId: string): Opportunity[] {
    const faces = manager.getDb().prepare(`SELECT face.id FROM faces face JOIN visual_regions region ON region.id = face.visual_region_id
        JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid WHERE asset.id = ?
        AND NOT EXISTS (SELECT 1 FROM photo_analysis_winners claim WHERE claim.asset_id = asset.id AND claim.subject_id = face.id
            AND claim.field = 'identity' AND claim.kind = 'user_confirmed')
        AND NOT EXISTS (SELECT 1 FROM semantic_propositions proposition JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
            WHERE proposition.subject_entity_id = face.id AND proposition.predicate = 'depicts'
              AND decision.is_current = 1 AND decision.status = 'accepted' AND decision.source_kind = 'human')
        ORDER BY face.id LIMIT 20`).all(assetId) as { id: string }[];
    return faces.flatMap(face => {
        const candidates = buildFamilyIdentityContext(manager, { assetId, faceId: face.id });
        if (candidates.length === 0) { return []; }
        return [{ target: { field: 'identity' as const, subjectId: face.id, concern: 'identity' as const,
            question: 'Compare bounded People/family candidates with independent face appearance and date; do not invent names.' },
            contextKey: JSON.stringify(['family', candidates]) }];
    });
}

function mergeOpportunities(opportunities: Opportunity[]): Opportunity[] {
    const grouped = new Map<string, Opportunity>();
    for (const item of opportunities) {
        const key = JSON.stringify([item.target.field, item.target.subjectId]);
        const previous = grouped.get(key);
        grouped.set(key, previous ? { target: previous.target, contextKey: JSON.stringify([previous.contextKey, item.contextKey]) } : item);
    }
    return [...grouped.values()];
}

/** Only materially changed, unresolved questions become eligible; never starts a paid model. */
export function reconsiderRefinementOpportunities(manager: DatabaseManager, event: PhotoEvent | null, assetId?: string): string[] {
    const changed = new Set<string>();
    const members = event ? loadEventMembers(manager, event.id) : [];
    const assetIds = members.length > 0 ? members.map(member => member.assetId) : [assetId!];
    for (const id of assetIds) {
        const member = members.find(item => item.assetId === id);
        const contextual = member ? [...fieldOpportunities(manager, member), ...identityOpportunities(manager, member)] : [];
        const targets = mergeOpportunities([...contextual, ...familyOpportunities(manager, id)]);
        for (const opportunity of targets) {
            if (updateOpportunity(manager.getDb(), id, opportunity)) { changed.add(id); }
        }
        withdrawResolvedOpportunities(manager.getDb(), id, targets);
    }
    return [...changed];
}
