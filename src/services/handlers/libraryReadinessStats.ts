import type Database from 'better-sqlite3';
import type { LibraryReadinessSummary } from '../../shared/libraryReadiness';
import { summarizeLibraryReadiness } from '../../shared/libraryReadiness';

type ReadinessRow = {
    location: string | null;
    estimated_date_display_label: string | null;
    estimated_date_most_likely: string | null;
    quality_technical: number | null;
    quality_discard: number | null;
    recommended_enhancements_json: string | null;
    subjects_json: string | null;
    regions_of_interest_json: string | null;
    has_faces: number;
};

function jsonArray(value: string | null) {
    if (!value) {return [] as unknown[];}
    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function buildLibraryReadinessSummary(db: Database.Database): LibraryReadinessSummary {
    const rows = db.prepare(`
        SELECT pm.location, pm.estimated_date_display_label, pm.estimated_date_most_likely,
            pm.quality_technical, pm.quality_discard, pm.recommended_enhancements_json,
            pm.subjects_json, pm.regions_of_interest_json,
            EXISTS(
                SELECT 1 FROM derived_results dr
                WHERE dr.asset_id = a.id AND dr.task IN ('face_detection', 'face_landmarks')
            ) AS has_faces
        FROM assets a
        LEFT JOIN photo_analysis_display pm ON pm.asset_id = a.id
        WHERE a.binned_at IS NULL
    `).all() as ReadinessRow[];
    return summarizeLibraryReadiness(rows.map((row) => ({
        faces: row.has_faces ? [{ box: { x: 0, y: 0, width: 0, height: 0 } }] : [],
        photo_metadata: {
            projection: {
                assetId: '', type: null, caption: null, description: null,
                location: row.location,
                estimatedDate: {
                    most_likely_date: row.estimated_date_most_likely,
                    min_date: null, max_date: null, display_label: row.estimated_date_display_label, rationale: null,
                },
                keywords: [], emotionalImpact: null,
                quality: { technical: row.quality_technical, lighting: null, composition: null, emotional: null, discard: row.quality_discard === 1 },
                recommendedEnhancements: jsonArray(row.recommended_enhancements_json).filter((value): value is string => typeof value === 'string'),
                authenticity: { score: null, reasons: [] },
                subjects: jsonArray(row.subjects_json),
                regionsOfInterest: jsonArray(row.regions_of_interest_json),
            },
        },
    })));
}
