import type { DatabaseManager } from '../../data/db';
import type { IndexedLinkFeature, LinkEvidence, MembershipAssessment } from '../../shared/relatedPhotos';
import { loadPhotoLinkFeatures } from './features';

type Db = ReturnType<DatabaseManager['getDb']>;
const POSTING_LIMIT = 12;
const CONTEXT_KINDS = new Set(['folder', 'album', 'sequence', 'timestamp', 'season', 'print']);
const GENERIC_KEYS = new Set(['christmas', 'christmas tree', 'tree', 'party', 'portrait', 'group', 'outdoor', 'outdoors',
    'indoor', 'indoors', 'house', 'building', 'car', 'vehicle', 'person', 'people', 'formal clothing', 'suit', 'dress', 'snow', 'summer', 'winter']);

function boundedLimit(limit: number): number {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) { throw new Error('Candidate limit must be between 1 and 100'); }
    return limit;
}

function addRows(ids: Set<string>, rows: { asset_id: string }[], assetId: string, limit: number): void {
    for (const row of rows) {
        if (ids.size >= limit) { return; }
        if (row.asset_id !== assetId) { ids.add(row.asset_id); }
    }
}

function addSequenceCandidates(db: Db, assetId: string, ids: Set<string>, limit: number): void {
    const ordered = db.prepare(`SELECT neighbor.asset_id FROM related_photo_order seed
        JOIN related_photo_order neighbor ON neighbor.context_key = seed.context_key
          AND neighbor.ordinal BETWEEN seed.ordinal - 6 AND seed.ordinal + 6
        WHERE seed.asset_id = ? AND neighbor.asset_id <> ?
        ORDER BY ABS(neighbor.ordinal - seed.ordinal), neighbor.asset_id LIMIT 12`).all(assetId, assetId) as { asset_id: string }[];
    addRows(ids, ordered, assetId, limit);
    const rows = db.prepare(`WITH seeds AS (SELECT member.sequence_id, member.ordinal FROM assets seed
        JOIN capture_sequence_members member ON member.asset_identity_guid = seed.asset_identity_guid
        JOIN capture_sequences sequence ON sequence.id = member.sequence_id AND sequence.status <> 'rejected'
        WHERE seed.id = ? AND member.status <> 'rejected' ORDER BY member.sequence_id LIMIT 8)
        SELECT asset.id AS asset_id FROM seeds
        JOIN capture_sequence_members neighbor ON neighbor.sequence_id = seeds.sequence_id
          AND neighbor.ordinal BETWEEN seeds.ordinal - 6 AND seeds.ordinal + 6 AND neighbor.status <> 'rejected'
        JOIN assets asset ON asset.asset_identity_guid = neighbor.asset_identity_guid
        WHERE asset.binned_at IS NULL ORDER BY seeds.sequence_id, neighbor.ordinal LIMIT 12`).all(assetId) as { asset_id: string }[];
    addRows(ids, rows, assetId, limit);
}

function addVisualCandidates(db: Db, assetId: string, ids: Set<string>, limit: number): void {
    const first = db.prepare(`SELECT asset.id AS asset_id FROM assets seed
        JOIN visual_similarity_observations observation ON observation.asset_identity_guid_a = seed.asset_identity_guid
        JOIN assets asset ON asset.asset_identity_guid = observation.asset_identity_guid_b
        WHERE seed.id = ? AND asset.binned_at IS NULL LIMIT 12`);
    const second = db.prepare(`SELECT asset.id AS asset_id FROM assets seed
        JOIN visual_similarity_observations observation ON observation.asset_identity_guid_b = seed.asset_identity_guid
        JOIN assets asset ON asset.asset_identity_guid = observation.asset_identity_guid_a
        WHERE seed.id = ? AND asset.binned_at IS NULL LIMIT 12`);
    addRows(ids, first.all(assetId) as { asset_id: string }[], assetId, limit);
    addRows(ids, second.all(assetId) as { asset_id: string }[], assetId, limit);
}

/** Each indexed posting and the returned union are capped; no all-pairs matching. */
export function findRelatedPhotoCandidates(manager: DatabaseManager, assetId: string, limit = 40): string[] {
    boundedLimit(limit);
    const db = manager.getDb();
    const ids = new Set<string>();
    const features = loadPhotoLinkFeatures(manager, assetId);
    addSequenceCandidates(db, assetId, ids, limit);
    const query = db.prepare(`SELECT feature.asset_id FROM related_photo_features feature
        JOIN assets asset ON asset.id = feature.asset_id AND asset.binned_at IS NULL
        WHERE feature.kind = ? AND feature.feature_key = ? AND feature.asset_id <> ?
        GROUP BY feature.asset_id ORDER BY feature.asset_id LIMIT ?`);
    for (const feature of features.filter(item => !CONTEXT_KINDS.has(item.kind)).slice(0, 32)) {
        addRows(ids, query.all(feature.kind, feature.key, assetId, POSTING_LIMIT) as { asset_id: string }[], assetId, limit);
        if (ids.size >= limit) { break; }
    }
    addVisualCandidates(db, assetId, ids, limit);
    for (const feature of features.filter(item => item.kind === 'album' || item.kind === 'folder' || item.kind === 'sequence').slice(0, 16)) {
        addRows(ids, query.all(feature.kind, feature.key, assetId, POSTING_LIMIT) as { asset_id: string }[], assetId, limit);
    }
    return [...ids];
}

function pairEvidence(left: IndexedLinkFeature, right: IndexedLinkFeature): LinkEvidence {
    const confidence = left.confidence === 'high' && right.confidence === 'high' ? 'high' : 'medium';
    const reliable = ['high', 'medium'].includes(left.confidence) && ['high', 'medium'].includes(right.confidence);
    return { kind: left.kind, text: `Shared ${left.kind}: ${left.label}`.slice(0, 180),
        sourceIds: [left.sourceId, right.sourceId], confidence: reliable ? confidence : 'low' };
}

function sharedFeatures(left: IndexedLinkFeature[], right: IndexedLinkFeature[]): LinkEvidence[] {
    const byKey = new Map(right.map(feature => [`${feature.kind}:${feature.key}`, feature]));
    const evidence = new Map<string, LinkEvidence>();
    for (const feature of left) {
        const match = byKey.get(`${feature.kind}:${feature.key}`);
        if (match) { evidence.set(`${feature.kind}:${feature.key}`, pairEvidence(feature, match)); }
    }
    return [...evidence.values()].slice(0, 12);
}

function isDistinctiveEvidence(item: LinkEvidence): boolean {
    return !CONTEXT_KINDS.has(item.kind)
        && !GENERIC_KEYS.has(item.text.slice(item.text.indexOf(':') + 1).trim().toLowerCase());
}

export function assessPhotoLink(manager: DatabaseManager, a: string, b: string): MembershipAssessment | null {
    if (a === b) { return null; }
    const evidence = sharedFeatures(loadPhotoLinkFeatures(manager, a), loadPhotoLinkFeatures(manager, b));
    if (evidence.length === 0) { return null; }
    const reliable = evidence.filter(item => item.confidence === 'high' || item.confidence === 'medium');
    const semantic = reliable.filter(isDistinctiveEvidence);
    const categories = new Set(semantic.map(item => item.kind));
    const labels = new Set(semantic.map(item => item.text.slice(item.text.indexOf(':') + 1).trim().toLowerCase()));
    const strong = categories.size >= 2 && labels.size >= 2 && semantic.some(item => item.kind !== 'person');
    const confidence = semantic.every(item => item.confidence === 'high') ? 'high' : 'medium';
    return { role: strong ? 'strong' : 'possible', confidence: strong ? confidence : 'low', evidence };
}
