import { createHash } from 'node:crypto';
import { posix, win32 } from 'node:path';
import type { DatabaseManager } from '../../data/db';
import { linkFeatureSchema, type IndexedLinkFeature, type LinkFeature } from '../../shared/relatedPhotos';
import { analysisValiditySql } from '../../shared/sql/analysisValidity';

type Db = ReturnType<DatabaseManager['getDb']>;
type ClaimRow = { id: string; field: string; value_json: string; confidence: LinkFeature['confidence'] };
type FeatureRow = { kind: LinkFeature['kind']; feature_key: string; label: string; confidence: LinkFeature['confidence']; source_id: string };
const MAX_VISUAL_FEATURES = 48;
const VISUAL_KINDS = new Set(['scene', 'clothing', 'building', 'vehicle', 'decoration', 'object', 'season', 'print']);

export function normalizeLinkKey(value: string): string {
    return value.normalize('NFKC').toLowerCase().trim().replaceAll(/\s+/g, ' ').slice(0, 160);
}

function contextKey(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function addFeature(features: IndexedLinkFeature[], assetId: string, sourceId: string, feature: LinkFeature): void {
    const parsed = linkFeatureSchema.safeParse({ ...feature, key: normalizeLinkKey(feature.key) });
    if (parsed.success && features.length < MAX_VISUAL_FEATURES) {
        features.push({ ...parsed.data, assetId, sourceId });
    }
}

function addClaimFeatures(db: Db, assetId: string, features: IndexedLinkFeature[]): void {
    const rows = db.prepare(`SELECT * FROM (SELECT c.id, c.field, c.value_json, c.confidence,
          ROW_NUMBER() OVER (PARTITION BY c.field, c.subject_id ORDER BY c.rowid DESC) AS current_rank
        FROM analysis_claims c
        JOIN analysis_runs r ON r.id = c.run_id
        WHERE c.asset_id = ? AND c.state = 'active' AND c.kind = 'observation'
          AND c.field IN ('link_features', 'appearance') AND r.stage IN ('scout', 'perception')
          AND ${analysisValiditySql('c')}
          AND NOT EXISTS (SELECT 1 FROM analysis_claim_roots dep WHERE dep.claim_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM analysis_claim_memberships dep WHERE dep.claim_id = c.id)
        ) WHERE current_rank = 1 LIMIT 48`).all(assetId) as ClaimRow[];
    for (const row of rows) {
        addParsedClaimFeatures(features, assetId, row);
    }
}

function capConfidence(feature: LinkFeature, claim: ClaimRow): LinkFeature {
    const ranks = { high: 3, medium: 2, low: 1, unknown: 0 };
    return { ...feature, confidence: ranks[feature.confidence] <= ranks[claim.confidence] ? feature.confidence : claim.confidence };
}

function addParsedClaimFeatures(features: IndexedLinkFeature[], assetId: string, row: ClaimRow): void {
    const value: unknown = JSON.parse(row.value_json);
    if (row.field === 'link_features') {
        if (!Array.isArray(value)) { return; }
        for (const feature of value) {
            const parsed = linkFeatureSchema.safeParse(feature);
            if (parsed.success && VISUAL_KINDS.has(parsed.data.kind)) {
                addFeature(features, assetId, row.id, capConfidence(parsed.data, row));
            }
        }
        return;
    }
    if (value && typeof value === 'object' && 'clothing' in value && typeof value.clothing === 'string') {
        addFeature(features, assetId, row.id, { kind: 'clothing', key: value.clothing,
            label: value.clothing.slice(0, 180), confidence: row.confidence });
    }
}

function addRegionFeatures(db: Db, assetId: string, features: IndexedLinkFeature[]): void {
    const rows = db.prepare(`SELECT region.id, region.label FROM analysis_regions region
        WHERE region.asset_id = ? AND region.run_id = (
          SELECT latest.id FROM analysis_runs latest WHERE latest.asset_id = ?
            AND latest.status = 'successful' AND latest.stage IN ('scout', 'perception')
          ORDER BY latest.rowid DESC LIMIT 1) LIMIT 30`).all(assetId, assetId) as { id: string; label: string }[];
    for (const row of rows) {
        const region = JSON.parse(row.label) as { kind?: string; observation?: string; confidence?: LinkFeature['confidence'] };
        if (region.observation && (region.kind === 'building' || region.kind === 'vehicle' || region.kind === 'object')) {
            addFeature(features, assetId, row.id, { kind: region.kind, key: region.observation,
                label: region.observation.slice(0, 180), confidence: region.confidence ?? 'unknown' });
        }
    }
}

function addHumanIdentities(db: Db, assetId: string, features: IndexedLinkFeature[]): void {
    const rows = db.prepare(`SELECT id, json_extract(value_json, '$.personId') AS person_id
        FROM analysis_claims WHERE asset_id = ? AND field = 'identity' AND state = 'active'
          AND kind = 'user_confirmed' AND json_extract(value_json, '$.personId') IS NOT NULL
        UNION ALL
        SELECT decision.id, entity.native_id FROM assets asset
        JOIN visual_regions region ON region.asset_identity_guid = asset.asset_identity_guid
        JOIN faces face ON face.visual_region_id = region.id
        JOIN semantic_propositions proposition ON proposition.subject_entity_id = face.id AND proposition.predicate = 'depicts'
        JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
        JOIN semantic_entities entity ON entity.id = proposition.object_entity_id AND entity.kind = 'person'
        WHERE asset.id = ? AND decision.is_current = 1 AND decision.status = 'accepted'
          AND decision.source_kind = 'human' LIMIT 20`).all(assetId, assetId) as { id: string; person_id: string }[];
    for (const row of rows) {
        addFeature(features, assetId, row.id, { kind: 'person', key: row.person_id, label: 'Confirmed person', confidence: 'high' });
    }
}

function addLocalContext(db: Db, assetId: string, features: IndexedLinkFeature[]): void {
    const row = db.prepare('SELECT original_path FROM assets WHERE id = ?').get(assetId) as { original_path: string } | undefined;
    if (!row) { throw new Error('Related-photo indexing requires an existing asset'); }
    const path = row.original_path.includes('\\') ? win32 : posix;
    const folder = path.dirname(row.original_path).normalize('NFKC').toLowerCase();
    const folderKey = contextKey(folder);
    features.push({ assetId, sourceId: `folder:${folderKey}`, kind: 'folder', key: folderKey,
        label: path.dirname(row.original_path).slice(0, 180), confidence: 'high' });
    const suffix = /^(.*?)(\d{1,12})\.[^.]+$/.exec(path.basename(row.original_path));
    db.prepare('DELETE FROM related_photo_order WHERE asset_id = ?').run(assetId);
    if (suffix) {
        const key = contextKey(`${folder}\n${normalizeLinkKey(suffix[1])}`);
        db.prepare('INSERT INTO related_photo_order (asset_id, context_key, ordinal) VALUES (?, ?, ?)')
            .run(assetId, key, Number(suffix[2]));
        features.push({ assetId, sourceId: `filename:${assetId}`, kind: 'sequence', key,
            label: 'Shared numbered filename series', confidence: 'high' });
    }
    const albums = db.prepare('SELECT album_id FROM album_items WHERE asset_id = ? ORDER BY album_id LIMIT 16')
        .all(assetId) as { album_id: string }[];
    for (const album of albums) {
        features.push({ assetId, sourceId: `album:${album.album_id}`, kind: 'album', key: album.album_id,
            label: 'Shared album', confidence: 'high' });
    }
    const sequences = db.prepare(`SELECT member.sequence_id FROM assets asset
        JOIN capture_sequence_members member ON member.asset_identity_guid = asset.asset_identity_guid
        JOIN capture_sequences sequence ON sequence.id = member.sequence_id
        WHERE asset.id = ? AND member.status <> 'rejected' AND sequence.status <> 'rejected'
        ORDER BY member.sequence_id LIMIT 8`).all(assetId) as { sequence_id: string }[];
    for (const sequence of sequences) {
        features.push({ assetId, sourceId: `sequence:${sequence.sequence_id}`, kind: 'sequence', key: sequence.sequence_id,
            label: 'Shared capture sequence', confidence: 'high' });
    }
}

/** Rebuildable search features contain independent observations and real local context only. */
export function indexPhotoFeatures(manager: DatabaseManager, assetId: string): void {
    const db = manager.getDb();
    db.transaction(() => {
        const features: IndexedLinkFeature[] = [];
        addClaimFeatures(db, assetId, features);
        addRegionFeatures(db, assetId, features);
        addHumanIdentities(db, assetId, features);
        addLocalContext(db, assetId, features);
        db.prepare('DELETE FROM related_photo_features WHERE asset_id = ?').run(assetId);
        const insert = db.prepare(`INSERT OR IGNORE INTO related_photo_features
            (asset_id, kind, feature_key, label, confidence, source_id) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const feature of features) {
            insert.run(assetId, feature.kind, feature.key, feature.label, feature.confidence, feature.sourceId);
        }
    })();
}

export function loadPhotoLinkFeatures(manager: DatabaseManager, assetId: string): IndexedLinkFeature[] {
    const rows = manager.getDb().prepare(`SELECT feature.kind, feature.feature_key, feature.label, feature.confidence, feature.source_id
        FROM related_photo_features feature LEFT JOIN analysis_claims claim ON claim.id = feature.source_id
        LEFT JOIN semantic_decisions decision ON decision.id = feature.source_id
        WHERE feature.asset_id = ? AND (claim.id IS NULL OR (claim.state = 'active' AND ${analysisValiditySql('claim')}))
          AND (decision.id IS NULL OR (decision.is_current = 1 AND decision.status = 'accepted' AND decision.source_kind = 'human'))
          AND NOT EXISTS (SELECT 1 FROM analysis_regions region WHERE region.id = feature.source_id AND region.run_id <>
              (SELECT latest.id FROM analysis_runs latest WHERE latest.asset_id = feature.asset_id
                AND latest.status = 'successful' AND latest.stage IN ('scout','perception') ORDER BY latest.rowid DESC LIMIT 1))
        ORDER BY feature.kind, feature.feature_key, feature.source_id LIMIT 80`)
        .all(assetId) as FeatureRow[];
    return rows.map(row => ({ assetId, kind: row.kind, key: row.feature_key, label: row.label,
        confidence: row.confidence, sourceId: row.source_id }));
}
