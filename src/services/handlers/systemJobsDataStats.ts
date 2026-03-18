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
    };
}
