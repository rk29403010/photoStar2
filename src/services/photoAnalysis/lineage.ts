import type { AnalysisClaim, AnalysisSource } from '../../shared/photoAnalysis/contracts';
import type { AnalysisDb, PersistAnalysisRunInput } from './repositoryTypes';
import { analysisValiditySql } from '../../shared/sql/analysisValidity';

type Membership = NonNullable<AnalysisSource['memberships']>[number];
type Root = { id: string; confidence: AnalysisClaim['confidence']; state: string };
export type SourceLineage = { roots: Root[]; memberships: Membership[]; confidence: AnalysisClaim['confidence']; contextual: boolean };
const CONFIDENCE_RANK = { unknown: 0, low: 1, medium: 2, high: 3 };

export function capEvidenceConfidence(requested: AnalysisClaim['confidence'], evidence: AnalysisClaim['confidence'][]): AnalysisClaim['confidence'] {
    return evidence.reduce((result, confidence) => CONFIDENCE_RANK[confidence] < CONFIDENCE_RANK[result] ? confidence : result, requested);
}

function inheritedMemberships(db: AnalysisDb, claimId: string): Membership[] {
    return db.prepare(`SELECT event_id AS eventId, asset_id AS assetId, revision FROM analysis_claim_memberships WHERE claim_id = ?`)
        .all(claimId) as Membership[];
}

function membershipConfidence(db: AnalysisDb, members: Membership[]): AnalysisClaim['confidence'] {
    const confidences = members.map(member => {
        const row = db.prepare('SELECT state, role, confidence, revision FROM photo_event_members WHERE event_id = ? AND asset_id = ?')
            .get(member.eventId, member.assetId) as { state: string; role: string; confidence: AnalysisClaim['confidence']; revision: number } | undefined;
        if (!row || row.state !== 'active' || row.revision !== member.revision) { throw new Error('Related evidence membership changed'); }
        return row.role === 'possible' ? capEvidenceConfidence('low', [row.confidence]) : row.confidence;
    });
    return capEvidenceConfidence('high', confidences);
}

function assertCurrentRoots(db: AnalysisDb, roots: Root[]): void {
    for (const root of roots) {
        if (root.state !== 'active' || !db.prepare(`SELECT 1 FROM analysis_claims c WHERE c.id = ? AND ${analysisValiditySql('c')}`).get(root.id)) {
            throw new Error('Related evidence contains an invalid or withdrawn root');
        }
    }
}

function sourceConfidence(source: Pick<AnalysisSource, 'kind' | 'evidenceConfidence'>, members: Membership[]): AnalysisClaim['confidence'] {
    const membershipCap = source.kind === 'related_photo' && members.length === 0 ? 'low' : 'high';
    return capEvidenceConfidence(source.evidenceConfidence ?? 'high', [membershipCap]);
}

function flattenRoot(db: AnalysisDb, claimId: string): { root: Root; ancestors: Root[]; members: Membership[] } {
    const root = db.prepare('SELECT id, confidence, state FROM analysis_claims WHERE id = ?').get(claimId) as Root | undefined;
    if (!root) { throw new Error('Related evidence requires a current root claim'); }
    assertCurrentRoots(db, [root]);
    const ancestors = db.prepare(`SELECT root.id, root.confidence, root.state FROM analysis_claim_roots dep
        JOIN analysis_claims root ON root.id = dep.root_claim_id WHERE dep.claim_id = ?`).all(claimId) as Root[];
    return { root, ancestors: ancestors.length > 0 ? ancestors : [root], members: inheritedMemberships(db, claimId) };
}

function declaredRootIds(source: AnalysisSource): string[] {
    const declared = source.rootClaimIds ?? (source.kind === 'claim' || source.kind === 'related_photo' ? [source.refId] : []);
    if (['claim', 'related_photo'].includes(source.kind) && declared.length === 0) { throw new Error('Related evidence requires independent roots'); }
    return declared;
}

/** Derived claims contribute their roots once; a chain is never an independent source. */
export function resolveSourceLineage(db: AnalysisDb, source: AnalysisSource): SourceLineage {
    const declared = declaredRootIds(source);
    const roots = new Map<string, Root>();
    const declaredConfidences: AnalysisClaim['confidence'][] = [];
    const memberships = new Map<string, Membership>();
    for (const member of source.memberships ?? []) { memberships.set(JSON.stringify([member.eventId, member.assetId]), member); }
    for (const claimId of declared) {
        const { root, ancestors, members } = flattenRoot(db, claimId);
        declaredConfidences.push(root.confidence);
        for (const item of ancestors) { roots.set(item.id, item); }
        for (const member of members) { memberships.set(JSON.stringify([member.eventId, member.assetId]), member); }
    }
    const members = [...memberships.values()];
    const resultRoots = [...roots.values()];
    assertCurrentRoots(db, resultRoots);
    return { roots: resultRoots, memberships: members,
        confidence: capEvidenceConfidence(sourceConfidence(source, members), [membershipConfidence(db, members), ...declaredConfidences, ...resultRoots.map(root => root.confidence)]),
        contextual: ['related_photo', 'person', 'relationship'].includes(source.kind) || members.length > 0 };
}

function storedSourceLineage(db: AnalysisDb, sourceId: string): SourceLineage {
    const roots = db.prepare(`SELECT root.id, root.confidence, root.state FROM analysis_source_roots dependency
        JOIN analysis_claims root ON root.id = dependency.root_claim_id WHERE dependency.source_id = ?`).all(sourceId) as Root[];
    const memberships = db.prepare(`SELECT event_id AS eventId, asset_id AS assetId, revision
        FROM analysis_source_memberships WHERE source_id = ?`).all(sourceId) as Membership[];
    assertCurrentRoots(db, roots);
    const source = db.prepare("SELECT kind, evidence_confidence AS evidenceConfidence FROM analysis_sources WHERE id = ? AND state = 'active'")
        .get(sourceId) as Pick<AnalysisSource, 'kind' | 'evidenceConfidence'> | undefined;
    if (!source) { throw new Error('Evidence source does not exist or was withdrawn'); }
    return { roots, memberships, confidence: capEvidenceConfidence(sourceConfidence(source, memberships),
        [membershipConfidence(db, memberships), ...roots.map(root => root.confidence)]),
        contextual: ['related_photo', 'person', 'relationship'].includes(source.kind) || memberships.length > 0 };
}

function referencedSources(claim: AnalysisClaim) {
    return [...new Set([...claim.sourceIds, ...claim.evidence.flatMap(item => item.sourceIds)])];
}

function assertLineageKind(claim: AnalysisClaim, contextual: boolean): void {
    if (!contextual) { return; }
    if (claim.field === 'appearance' || claim.field === 'link_features') {
        throw new Error('Visible observations must be independent of identity and event context');
    }
    if (['date', 'location', 'identity'].includes(claim.field) && !['inferred_conclusion', 'hypothesis'].includes(claim.kind)) {
        throw new Error('Contextual conclusions must retain their inferred kind');
    }
}

function assertLineageAuthority(stage: PersistAnalysisRunInput['stage'], lines: SourceLineage[]): void {
    if (stage !== 'user' && stage !== 'local') { return; }
    if (lines.some(line => line.contextual || line.roots.length > 0)) {
        throw new Error('Contextual dependencies cannot create direct authoritative truth');
    }
}

export function validateClaimLineage(db: AnalysisDb, input: PersistAnalysisRunInput): void {
    const supplied = new Map(input.sources.map(source => [source.id, resolveSourceLineage(db, source)]));
    for (const claim of input.result.claims) {
        const lines = referencedSources(claim).map(id => supplied.get(id) ?? storedSourceLineage(db, id));
        assertLineageAuthority(input.stage, lines);
        assertLineageKind(claim, lines.some(line => line.contextual));
        if (capEvidenceConfidence(claim.confidence, lines.map(line => line.confidence)) !== claim.confidence) {
            throw new Error('Derived confidence cannot exceed its root evidence');
        }
    }
}

export function persistSourceLineage(db: AnalysisDb, source: AnalysisSource): void {
    const lineage = resolveSourceLineage(db, source);
    for (const root of lineage.roots) {
        db.prepare('INSERT INTO analysis_source_roots(source_id, root_claim_id) VALUES (?, ?)').run(source.id, root.id);
    }
    for (const member of lineage.memberships) {
        db.prepare('INSERT INTO analysis_source_memberships(source_id, event_id, asset_id, revision) VALUES (?, ?, ?, ?)')
            .run(source.id, member.eventId, member.assetId, member.revision);
    }
}

export function persistClaimLineage(db: AnalysisDb, claim: AnalysisClaim, claimId: string): void {
    const support = referencedSources(claim);
    const contradict = claim.contradictions.flatMap(item => item.sourceIds);
    for (const [role, ids] of [['support', support], ['contradiction', contradict]] as const) {
        for (const sourceId of new Set(ids)) {
            const lineage = storedSourceLineage(db, sourceId);
            for (const root of lineage.roots) {
                db.prepare('INSERT OR IGNORE INTO analysis_claim_roots(claim_id, root_claim_id, role) VALUES (?, ?, ?)')
                    .run(claimId, root.id, role);
            }
            for (const member of lineage.memberships) {
                db.prepare('INSERT OR IGNORE INTO analysis_claim_memberships(claim_id, event_id, asset_id, revision) VALUES (?, ?, ?, ?)')
                    .run(claimId, member.eventId, member.assetId, member.revision);
            }
        }
    }
}
