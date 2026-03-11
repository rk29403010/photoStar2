function asDbLike(db: unknown) {
    return db as {
        prepare: (sql: string) => {
            get: (...args: unknown[]) => unknown;
            all: (...args: unknown[]) => unknown[];
        };
    };
}

type CountRow = { count: number };

function getCount(db: unknown, sql: string): number {
    const typedDb = asDbLike(db);
    return (typedDb.prepare(sql).get() as CountRow).count;
}

function toPercent(done: number, total: number): number {
    if (total <= 0) {return 0;}
    return (done / total) * 100;
}

function getAiMetadataQueueStats(db: unknown) {
    return {
        freshPending: getCount(db, "SELECT COUNT(*) as count FROM task_queue WHERE pipeline_stage IN ('ai_metadata_3f', 'ai_metadata_v2_3f') AND status = 'pending'"),
        freshProcessing: getCount(db, "SELECT COUNT(*) as count FROM task_queue WHERE pipeline_stage IN ('ai_metadata_3f', 'ai_metadata_v2_3f') AND status = 'processing'"),
        freshFailed: getCount(db, "SELECT COUNT(*) as count FROM task_queue WHERE pipeline_stage IN ('ai_metadata_3f', 'ai_metadata_v2_3f') AND status = 'failed'"),
        proPending: getCount(db, "SELECT COUNT(*) as count FROM task_queue WHERE pipeline_stage IN ('ai_metadata_31p', 'ai_metadata_v2_31p') AND status = 'pending'"),
        proProcessing: getCount(db, "SELECT COUNT(*) as count FROM task_queue WHERE pipeline_stage IN ('ai_metadata_31p', 'ai_metadata_v2_31p') AND status = 'processing'"),
        proFailed: getCount(db, "SELECT COUNT(*) as count FROM task_queue WHERE pipeline_stage IN ('ai_metadata_31p', 'ai_metadata_v2_31p') AND status = 'failed'"),
        proCompleted: getCount(db, "SELECT COUNT(*) as count FROM task_queue WHERE pipeline_stage IN ('ai_metadata_31p', 'ai_metadata_v2_31p') AND status = 'completed'"),
    };
}

function getFaceDetectionStats(db: unknown) {
    const typedDb = asDbLike(db);
    try {
        const photosWithDetectedFaces = (typedDb.prepare(`
            SELECT COUNT(*) as count
            FROM derived_results
            WHERE task = 'face_detection'
              AND COALESCE(json_array_length(json_extract(data, '$.faces')), 0) > 0
        `).get() as CountRow).count;
        const detectedFaces = (typedDb.prepare(`
            SELECT COALESCE(SUM(COALESCE(json_array_length(json_extract(data, '$.faces')), 0)), 0) as count
            FROM derived_results
            WHERE task = 'face_detection'
        `).get() as CountRow).count;
        return { photosWithDetectedFaces, detectedFaces };
    } catch {
        return { photosWithDetectedFaces: 0, detectedFaces: 0 };
    }
}

function getLastAiMetadataQuotaBlock(db: unknown) {
    const typedDb = asDbLike(db);
    const rows = typedDb.prepare(`
        SELECT payload, created_at
        FROM events
        WHERE type = 'QuotaWarning'
        ORDER BY created_at DESC
        LIMIT 50
    `).all() as { payload: string; created_at: string }[];

    for (const row of rows) {
        try {
            const payload = JSON.parse(row.payload) as {
                model?: unknown;
                reason?: unknown;
                fallbackModel?: unknown;
                pendingProCount?: unknown;
                assetIds?: unknown;
            };
            if (payload.reason !== 'rate_limit' && payload.reason !== 'daily_quota') {
                continue;
            }

            const pendingCount = Number(payload.pendingProCount || 0);
            const affectedCount = pendingCount > 0
                ? pendingCount
                : Array.isArray(payload.assetIds)
                    ? payload.assetIds.length
                    : 0;

            return {
                createdAt: row.created_at,
                model: String(payload.model || 'model'),
                reason: payload.reason,
                fallbackModel: typeof payload.fallbackModel === 'string' ? payload.fallbackModel : '',
                affectedCount,
            };
        } catch {
            // ignore malformed historical payloads
        }
    }

    return null;
}

export function getDataStats(db: unknown) {
    const totalAssets = getCount(db, 'SELECT COUNT(*) as count FROM assets');
    const photosWithDetectedFacesAndCounts = getFaceDetectionStats(db);
    const matchedFaces = getCount(db, 'SELECT COUNT(*) as count FROM face_assignments');
    const photosWithMatchedFaces = getCount(db, 'SELECT COUNT(DISTINCT asset_id) as count FROM face_assignments');

    return {
        generatedAt: new Date().toISOString(),
        totals: {
            assets: totalAssets,
            people: getCount(db, 'SELECT COUNT(*) as count FROM people'),
            photosWithAiMetadata: getCount(db, "SELECT COUNT(DISTINCT asset_id) as count FROM derived_results WHERE task = 'ai_metadata'"),
            photosWithDetectedFaces: photosWithDetectedFacesAndCounts.photosWithDetectedFaces,
            photosWithMatchedFaces,
            pendingProAnalysis: getCount(db, "SELECT COUNT(DISTINCT asset_id) as count FROM derived_results WHERE task = 'ai_metadata_pro_pending'"),
        },
        coverage: {
            aiMetadataPercent: toPercent(getCount(db, "SELECT COUNT(DISTINCT asset_id) as count FROM derived_results WHERE task = 'ai_metadata'"), totalAssets),
            faceMatchedPercent: toPercent(photosWithMatchedFaces, photosWithDetectedFacesAndCounts.photosWithDetectedFaces),
        },
        faces: {
            detected: photosWithDetectedFacesAndCounts.detectedFaces,
            matched: matchedFaces,
            unmatched: Math.max(0, photosWithDetectedFacesAndCounts.detectedFaces - matchedFaces),
        },
        aiMetadataQueues: getAiMetadataQueueStats(db),
        lastAiMetadataQuotaBlock: getLastAiMetadataQuotaBlock(db)
    };
}
