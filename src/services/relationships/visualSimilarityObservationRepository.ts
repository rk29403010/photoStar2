import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type VisualSimilarityObservationInput = {
    assetIdA: string;
    assetIdB: string;
    phashDistance: number;
    dhashDistance: number;
    score: number;
    evidence?: Record<string, unknown> | null;
};

export type ReplaceVisualSimilarityObservationsInput = {
    impactedAssetIds: string[];
    sourceIdentity: string;
    sourceRef?: string | null;
    algorithmVersion?: string | null;
    observations: VisualSimilarityObservationInput[];
};

export type VisualSimilarityObservation = {
    assetIdentityGuidA: string;
    assetIdentityGuidB: string;
    currentAssetIdA: string | null;
    currentAssetIdB: string | null;
    sourceIdentity: string;
    sourceRef: string | null;
    algorithmVersion: string | null;
    phashDistance: number;
    dhashDistance: number;
    score: number;
    evidenceJson: string | null;
};

type AssetIdentity = {
    guid: string;
    originalPath: string;
};

type ObservationRow = {
    asset_identity_guid_a: string;
    asset_identity_guid_b: string;
    current_asset_id_a: string | null;
    current_asset_id_b: string | null;
    source_identity: string;
    source_ref: string | null;
    algorithm_version: string | null;
    phash_distance: number;
    dhash_distance: number;
    score: number;
    evidence_json: string | null;
};

function assertDistance(value: number, label: string): void {
    if (!Number.isInteger(value) || value < 0 || value > 64) {
        throw new Error(`${label} must be an integer between 0 and 64.`);
    }
}

function assertScore(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error('Visual similarity score must be between 0 and 1.');
    }
}

function loadAssetPath(db: DbHandle, assetId: string): string {
    const row = db.prepare('SELECT original_path FROM assets WHERE id = ?').get(assetId) as
        | { original_path: string }
        | undefined;
    if (!row) {
        throw new Error(`Unknown visual-similarity asset '${assetId}'.`);
    }
    return row.original_path;
}

function ensureAssetIdentity(db: DbHandle, assetId: string): AssetIdentity {
    const originalPath = loadAssetPath(db, assetId);
    const existing = db.prepare(`
        SELECT guid, original_path
        FROM asset_identities
        WHERE original_path = ?
    `).get(originalPath) as { guid: string; original_path: string } | undefined;
    if (existing) {
        return { guid: existing.guid, originalPath: existing.original_path };
    }
    const guid = uuidv4();
    db.prepare(`
        INSERT INTO asset_identities (guid, original_path)
        VALUES (?, ?)
    `).run(guid, originalPath);
    return { guid, originalPath };
}

function canonicalizePair(
    left: AssetIdentity,
    right: AssetIdentity,
): [AssetIdentity, AssetIdentity] {
    if (left.guid === right.guid) {
        throw new Error('A visual similarity observation requires two different asset identities.');
    }
    return left.guid.localeCompare(right.guid) < 0 ? [left, right] : [right, left];
}

function deleteImpactedObservations(
    db: DbHandle,
    identityGuids: readonly string[],
    sourceIdentity: string,
): void {
    if (identityGuids.length === 0) {
        return;
    }
    const placeholders = identityGuids.map(() => '?').join(', ');
    db.prepare(`
        DELETE FROM visual_similarity_observations
        WHERE source_identity = ?
          AND (
            asset_identity_guid_a IN (${placeholders})
            OR asset_identity_guid_b IN (${placeholders})
          )
    `).run(sourceIdentity, ...identityGuids, ...identityGuids);
}

function insertObservation(
    db: DbHandle,
    input: ReplaceVisualSimilarityObservationsInput,
    observation: VisualSimilarityObservationInput,
): void {
    assertDistance(observation.phashDistance, 'pHash distance');
    assertDistance(observation.dhashDistance, 'dHash distance');
    assertScore(observation.score);
    const left = ensureAssetIdentity(db, observation.assetIdA);
    const right = ensureAssetIdentity(db, observation.assetIdB);
    const [first, second] = canonicalizePair(left, right);
    db.prepare(`
        INSERT INTO visual_similarity_observations (
            asset_identity_guid_a,
            asset_identity_guid_b,
            source_identity,
            source_ref,
            algorithm_version,
            phash_distance,
            dhash_distance,
            score,
            evidence_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_identity_guid_a, asset_identity_guid_b, source_identity)
        DO UPDATE SET
            source_ref = excluded.source_ref,
            algorithm_version = excluded.algorithm_version,
            phash_distance = excluded.phash_distance,
            dhash_distance = excluded.dhash_distance,
            score = excluded.score,
            evidence_json = excluded.evidence_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        first.guid,
        second.guid,
        input.sourceIdentity,
        input.sourceRef ?? null,
        input.algorithmVersion ?? null,
        observation.phashDistance,
        observation.dhashDistance,
        observation.score,
        observation.evidence ? JSON.stringify(observation.evidence) : null,
    );
}

export function replaceVisualSimilarityObservations(
    db: DbHandle,
    input: ReplaceVisualSimilarityObservationsInput,
): void {
    const sourceIdentity = input.sourceIdentity.trim();
    if (!sourceIdentity) {
        throw new Error('Visual similarity sourceIdentity is required.');
    }
    const impactedGuids = [...new Set(input.impactedAssetIds)]
        .map((assetId) => ensureAssetIdentity(db, assetId).guid);
    db.transaction(() => {
        deleteImpactedObservations(db, impactedGuids, sourceIdentity);
        for (const observation of input.observations) {
            insertObservation(db, { ...input, sourceIdentity }, observation);
        }
    })();
}

function toObservation(row: ObservationRow): VisualSimilarityObservation {
    return {
        assetIdentityGuidA: row.asset_identity_guid_a,
        assetIdentityGuidB: row.asset_identity_guid_b,
        currentAssetIdA: row.current_asset_id_a,
        currentAssetIdB: row.current_asset_id_b,
        sourceIdentity: row.source_identity,
        sourceRef: row.source_ref,
        algorithmVersion: row.algorithm_version,
        phashDistance: row.phash_distance,
        dhashDistance: row.dhash_distance,
        score: row.score,
        evidenceJson: row.evidence_json,
    };
}

export function getVisualSimilarityObservationsForAsset(
    db: DbHandle,
    assetId: string,
    sourceIdentity?: string,
): VisualSimilarityObservation[] {
    const identity = ensureAssetIdentity(db, assetId);
    const sourceClause = sourceIdentity ? 'AND observation.source_identity = ?' : '';
    const args = sourceIdentity ? [identity.guid, identity.guid, sourceIdentity] : [identity.guid, identity.guid];
    const rows = db.prepare(`
        SELECT
            observation.asset_identity_guid_a,
            observation.asset_identity_guid_b,
            (
                SELECT asset.id
                FROM assets asset
                JOIN asset_identities identity_a ON identity_a.original_path = asset.original_path
                WHERE identity_a.guid = observation.asset_identity_guid_a
                ORDER BY asset.created_at DESC, asset.id DESC
                LIMIT 1
            ) AS current_asset_id_a,
            (
                SELECT asset.id
                FROM assets asset
                JOIN asset_identities identity_b ON identity_b.original_path = asset.original_path
                WHERE identity_b.guid = observation.asset_identity_guid_b
                ORDER BY asset.created_at DESC, asset.id DESC
                LIMIT 1
            ) AS current_asset_id_b,
            observation.source_identity,
            observation.source_ref,
            observation.algorithm_version,
            observation.phash_distance,
            observation.dhash_distance,
            observation.score,
            observation.evidence_json
        FROM visual_similarity_observations observation
        WHERE (
            observation.asset_identity_guid_a = ?
            OR observation.asset_identity_guid_b = ?
        )
        ${sourceClause}
        ORDER BY observation.phash_distance ASC,
                 observation.dhash_distance ASC,
                 observation.asset_identity_guid_a ASC,
                 observation.asset_identity_guid_b ASC
    `).all(...args) as ObservationRow[];
    return rows.map(toObservation);
}
