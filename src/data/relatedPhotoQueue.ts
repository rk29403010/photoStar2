import type Database from 'better-sqlite3';

/** Called inside evidence mutations; the queue survives application restarts. */
export function queuePhotoEvidenceChange(db: Database.Database, assetId: string, cause: string): void {
    db.prepare(`INSERT INTO related_photo_queue(asset_id, cause, revision, status, attempts, error, updated_at)
        SELECT id, ?, 1, 'pending', 0, NULL, ? FROM assets WHERE id = ?
        ON CONFLICT(asset_id) DO UPDATE SET cause = excluded.cause, revision = revision + 1,
          status = 'pending', attempts = 0, error = NULL, updated_at = excluded.updated_at`)
        .run(cause, new Date().toISOString(), assetId);
    db.prepare(`INSERT INTO related_photo_queue(asset_id, cause, revision, status, attempts, error, updated_at)
        SELECT DISTINCT claim.asset_id, ?, 1, 'pending', 0, NULL, ?
        FROM analysis_claim_roots dependency JOIN analysis_claims root ON root.id = dependency.root_claim_id
        JOIN analysis_claims claim ON claim.id = dependency.claim_id
        WHERE root.asset_id = ? AND claim.state = 'active' AND claim.asset_id <> ?
        ON CONFLICT(asset_id) DO UPDATE SET cause = excluded.cause, revision = revision + 1,
          status = 'pending', error = NULL, updated_at = excluded.updated_at`)
        .run(cause, new Date().toISOString(), assetId, assetId);
}
