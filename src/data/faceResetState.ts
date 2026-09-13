import type { DatabaseManager } from './db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type FaceAnalysisResetResult = {
    affectedFaceCount: number;
    affectedGenerationCount: number;
};

function placeholders(values: readonly string[]): string {
    return values.map(() => '?').join(', ');
}

function loadAffectedFaceIds(db: DbHandle, assetId?: string): string[] {
    if (!assetId) {
        return (db.prepare('SELECT id FROM faces ORDER BY id').all() as Array<{ id: string }>)
            .map((row) => row.id);
    }
    return (db.prepare(`
        SELECT face.id
        FROM assets asset
        JOIN visual_regions region ON region.asset_identity_guid = asset.asset_identity_guid
        JOIN faces face ON face.visual_region_id = region.id
        WHERE asset.id = ?
        ORDER BY face.id
    `).all(assetId) as Array<{ id: string }>).map((row) => row.id);
}

function loadAffectedGenerationIds(
    db: DbHandle,
    faceIds: readonly string[],
    assetId?: string,
): string[] {
    if (!assetId) {
        return (db.prepare(`
            SELECT id
            FROM analysis_generations
            WHERE scope_key LIKE 'face-vectors:%'
            ORDER BY id
        `).all() as Array<{ id: string }>).map((row) => row.id);
    }

    const ids = new Set((db.prepare(`
        SELECT id
        FROM analysis_generations
        WHERE scope_key = ?
    `).all(`face-vectors:${assetId}`) as Array<{ id: string }>).map((row) => row.id));
    if (faceIds.length > 0) {
        const rows = db.prepare(`
            SELECT DISTINCT analysis_generation_id AS id
            FROM feature_vectors
            WHERE feature_key = 'face_embedding'
              AND subject_entity_id IN (${placeholders(faceIds)})
        `).all(...faceIds) as Array<{ id: string }>;
        for (const row of rows) {
            ids.add(row.id);
        }
    }
    return [...ids].sort((left, right) => left.localeCompare(right));
}

function clearGlobalFaceProjections(db: DbHandle): void {
    db.prepare('DELETE FROM face_person_candidates').run();
    db.prepare('DELETE FROM identity_cluster_members').run();
    db.prepare('DELETE FROM identity_clusters').run();
}

function clearGenerationState(
    db: DbHandle,
    generationIds: readonly string[],
    faceIds: readonly string[],
    assetId?: string,
): void {
    if (!assetId) {
        db.prepare("DELETE FROM analysis_generation_heads WHERE scope_key LIKE 'face-vectors:%'").run();
        db.prepare("DELETE FROM feature_vectors WHERE feature_key = 'face_embedding'").run();
    } else {
        db.prepare('DELETE FROM analysis_generation_heads WHERE scope_key = ?')
            .run(`face-vectors:${assetId}`);
        if (generationIds.length > 0) {
            db.prepare(`
                DELETE FROM analysis_generation_heads
                WHERE active_generation_id IN (${placeholders(generationIds)})
            `).run(...generationIds);
            db.prepare(`
                DELETE FROM feature_vectors
                WHERE analysis_generation_id IN (${placeholders(generationIds)})
            `).run(...generationIds);
        }
        if (faceIds.length > 0) {
            db.prepare(`
                DELETE FROM feature_vectors
                WHERE feature_key = 'face_embedding'
                  AND subject_entity_id IN (${placeholders(faceIds)})
            `).run(...faceIds);
        }
    }

    if (generationIds.length > 0) {
        db.prepare(`
            UPDATE analysis_generations
            SET status = 'failed',
                updated_at = CURRENT_TIMESTAMP,
                finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP)
            WHERE status = 'running'
              AND id IN (${placeholders(generationIds)})
        `).run(...generationIds);
    }
}

function clearLegacyFaceState(db: DbHandle, assetId?: string): void {
    if (!assetId) {
        db.prepare("DELETE FROM derived_results WHERE task IN ('face_detection', 'face_recognition')").run();
        db.prepare("DELETE FROM asset_mask_metadata WHERE source_id = 'runtime.detect_faces'").run();
        db.prepare('DELETE FROM face_assignments').run();
        return;
    }
    db.prepare("DELETE FROM derived_results WHERE asset_id = ? AND task IN ('face_detection', 'face_recognition')")
        .run(assetId);
    db.prepare("DELETE FROM asset_mask_metadata WHERE asset_id = ? AND source_id = 'runtime.detect_faces'")
        .run(assetId);
    db.prepare('DELETE FROM face_assignments WHERE asset_id = ?').run(assetId);
}

function pruneMachineOnlyPeople(db: DbHandle): void {
    db.prepare(`
        DELETE FROM people
        WHERE lifecycle_status = 'provisional'
          AND NOT EXISTS (
              SELECT 1 FROM person_redirects redirect
              WHERE redirect.old_person_id = people.id OR redirect.current_person_id = people.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM people_gedcom_links link
              WHERE link.person_id = people.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM face_assignments assignment
              WHERE assignment.person_id = people.id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM semantic_entities entity
              JOIN semantic_propositions proposition
                ON proposition.object_entity_id = entity.id
              WHERE entity.kind = 'person'
                AND entity.native_id = people.id
                AND (
                    EXISTS (
                        SELECT 1 FROM semantic_attestations attestation
                        WHERE attestation.proposition_id = proposition.id
                          AND attestation.source_kind IN ('human', 'import')
                    )
                    OR EXISTS (
                        SELECT 1 FROM semantic_decisions decision
                        WHERE decision.proposition_id = proposition.id
                          AND decision.source_kind != 'machine'
                    )
                    OR EXISTS (
                        SELECT 1 FROM review_response_propositions response
                        WHERE response.proposition_id = proposition.id
                    )
                )
          )
    `).run();
}

export function resetFaceAnalysisState(db: DbHandle, assetId?: string): FaceAnalysisResetResult {
    return db.transaction(() => {
        const faceIds = loadAffectedFaceIds(db, assetId);
        const generationIds = loadAffectedGenerationIds(db, faceIds, assetId);
        clearGlobalFaceProjections(db);
        clearGenerationState(db, generationIds, faceIds, assetId);
        clearLegacyFaceState(db, assetId);
        pruneMachineOnlyPeople(db);
        return {
            affectedFaceCount: faceIds.length,
            affectedGenerationCount: generationIds.length,
        };
    })();
}
