import { randomUUID } from 'node:crypto';
import type { DatabaseManager } from '../../data/db';
import type { NetworkImpact } from '../../shared/relatedPhotos';
import { loadAnalysis } from '../photoAnalysis/repository';

type FieldState = { value: unknown; confidence: string; kind: string; roots: string[] };
export type ArchiveState = { date: FieldState | null; location: FieldState | null; quality: FieldState | null;
    candidates: string[]; refinements: string[]; metadataReady: boolean; ready: boolean };

const UNKNOWN_METADATA_VALUES = new Set(['', 'unknown', 'unknown date', 'unknown location', 'not known']);

function hasKnownMetadataText(value: unknown): boolean {
    return typeof value === 'string' && !UNKNOWN_METADATA_VALUES.has(value.trim().toLowerCase());
}

function reliableField(field: FieldState | null): boolean {
    if (!field || !['medium', 'high'].includes(field.confidence)) { return false; }
    const value = field.value;
    if (!value || typeof value !== 'object') { return false; }
    const label = 'label' in value ? value.label : null;
    const start = 'start' in value ? value.start : null;
    const end = 'end' in value ? value.end : null;
    return [label, start, end].some(hasKnownMetadataText);
}

function hasUnresolvedPeople(manager: DatabaseManager, assetId: string): boolean {
    return Boolean(manager.getDb().prepare(`SELECT 1 FROM faces face JOIN visual_regions region ON region.id = face.visual_region_id
        JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid WHERE asset.id = ?
        AND NOT EXISTS (SELECT 1 FROM photo_analysis_winners claim WHERE claim.asset_id = asset.id AND claim.subject_id = face.id
            AND claim.field = 'identity' AND claim.kind = 'user_confirmed' AND json_extract(claim.value_json, '$.personId') IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM semantic_propositions proposition JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
            WHERE proposition.subject_entity_id = face.id AND proposition.predicate = 'depicts'
              AND decision.is_current = 1 AND decision.status = 'accepted' AND decision.source_kind = 'human') LIMIT 1`).get(assetId));
}

function appearanceReady(analysis: ReturnType<typeof loadAnalysis>): boolean {
    const quality = analysis.winners.find(claim => claim.field === 'quality');
    return quality?.field === 'quality' && quality.value.technical === 'good' && quality.value.composition === 'good'
        && ['medium', 'high'].includes(quality.value.assessmentConfidence)
        && analysis.enhancementRecommendations.length === 0;
}

export function captureArchiveState(manager: DatabaseManager, assetId: string): ArchiveState {
    const db = manager.getDb();
    const analysis = loadAnalysis(manager, assetId);
    const field = (name: 'date' | 'location' | 'quality'): FieldState | null => {
        const claim = analysis.winners.find(item => item.field === name && item.subjectId === null);
        if (!claim) { return null; }
        const roots = db.prepare('SELECT root_claim_id FROM analysis_claim_roots WHERE claim_id = ? ORDER BY root_claim_id')
            .all(claim.id) as { root_claim_id: string }[];
        return { value: claim.value, confidence: claim.confidence, kind: claim.kind, roots: roots.map(root => root.root_claim_id) };
    };
    const date = field('date'); const location = field('location'); const quality = field('quality');
    const candidates = db.prepare(`SELECT candidate.face_id || ':' || candidate.person_id AS id FROM related_face_candidates candidate
        JOIN faces face ON face.id = candidate.face_id JOIN visual_regions region ON region.id = face.visual_region_id
        JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid
        WHERE asset.id = ? ORDER BY id`).all(assetId) as { id: string }[];
    const refinements = db.prepare(`SELECT field || ':' || subject_id AS id FROM related_refinement_opportunities
        WHERE asset_id = ? AND state = 'pending' ORDER BY id`).all(assetId) as { id: string }[];
    const metadataReady = reliableField(date) && reliableField(location) && !hasUnresolvedPeople(manager, assetId);
    const pendingReview = db.prepare("SELECT 1 FROM review_items WHERE subject_id = ? AND status = 'pending' LIMIT 1").get(assetId);
    return { date, location, quality, candidates: [...new Set(candidates.map(row => row.id))], refinements: refinements.map(row => row.id),
        metadataReady, ready: metadataReady && appearanceReady(analysis) && !pendingReview };
}

export function previousArchiveState(manager: DatabaseManager, assetId: string): ArchiveState {
    const row = manager.getDb().prepare('SELECT state_json FROM related_photo_state WHERE asset_id = ?').get(assetId) as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) as ArchiveState : captureArchiveState(manager, assetId);
}

function writeImpact(manager: DatabaseManager, params: Omit<NetworkImpact, 'id'>): NetworkImpact {
    const event = { id: randomUUID(), ...params };
    manager.getDb().prepare(`INSERT INTO archive_impacts(id, cause, asset_id, kind, field, before_json, after_json, root_claim_ids_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(event.id, event.cause, event.assetId, event.kind, event.field, JSON.stringify(event.before),
            JSON.stringify(event.after), JSON.stringify(event.rootClaimIds), new Date().toISOString());
    return event;
}

function fieldImpactKind(before: FieldState | null, after: FieldState | null): NetworkImpact['kind'] {
    if (after?.value && (!before?.value || JSON.stringify(before.value) !== JSON.stringify(after.value))) { return 'discovery'; }
    const ranks: Record<string, number> = { unknown: 0, low: 1, medium: 2, high: 3 };
    return after?.value && ranks[after.confidence] > ranks[before?.confidence ?? 'unknown'] ? 'progress' : 'opportunity';
}

function impactKind(field: keyof ArchiveState, before: ArchiveState, after: ArchiveState): NetworkImpact['kind'] {
    if (field === 'date' || field === 'location' || field === 'quality') { return fieldImpactKind(before[field], after[field]); }
    if ((field === 'metadataReady' || field === 'ready') && after[field]) { return 'progress'; }
    return 'opportunity';
}

/** Immutable impacts compare observed states; a rerun with unchanged evidence emits nothing. */
export function recordArchiveImpacts(manager: DatabaseManager, assetId: string, cause: string, before: ArchiveState): NetworkImpact[] {
    const after = captureArchiveState(manager, assetId);
    const impacts: NetworkImpact[] = [];
    for (const field of ['date', 'location', 'quality', 'candidates', 'refinements', 'metadataReady', 'ready'] as const) {
        if (JSON.stringify(before[field]) === JSON.stringify(after[field])) { continue; }
        const kind = impactKind(field, before, after);
        const rootClaimIds = field === 'date' || field === 'location' || field === 'quality' ? after[field]?.roots ?? before[field]?.roots ?? [] : [];
        impacts.push(writeImpact(manager, { cause, assetId, kind, field, before: before[field], after: after[field], rootClaimIds }));
    }
    manager.getDb().prepare(`INSERT INTO related_photo_state(asset_id, state_json, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(asset_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`)
        .run(assetId, JSON.stringify(after), new Date().toISOString());
    return impacts;
}
