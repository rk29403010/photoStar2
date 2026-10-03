import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { DatabaseManager } from '../../data/db';
import type { AnalysisClaim, AnalysisSource, RefinementTarget } from '../../shared/photoAnalysis/contracts';
import { prepareAnalysisImages } from './imageInputs';
import { loadAnalysis } from './repository';

export type AnalysisAssetRow = {
    id: string; original_path: string; width: number | null; height: number | null;
    sensitivity_status?: string | null; sensitivity_score?: number | null;
};

function loadLocalFaces(dbManager: DatabaseManager, assetId: string) {
    const rows = dbManager.getDb().prepare(`
        SELECT f.id AS faceId, g.x, g.y, g.width, g.height
        FROM faces f JOIN visual_regions v ON v.id = f.visual_region_id
        JOIN assets a ON a.asset_identity_guid = v.asset_identity_guid
        JOIN visual_region_geometry_generations g ON g.rowid = (
            SELECT latest.rowid FROM visual_region_geometry_generations latest
            WHERE latest.visual_region_id = v.id ORDER BY latest.created_at DESC, latest.rowid DESC LIMIT 1
        ) WHERE a.id = ? AND g.status = 'active' ORDER BY f.id
    `).all(assetId) as Array<{ faceId: string; x: number; y: number; width: number; height: number }>;
    return rows.map(row => ({ faceId: row.faceId, box: { x: row.x, y: row.y, width: row.width, height: row.height } }));
}

function readEmbedded(dbManager: DatabaseManager, assetId: string): Record<string, unknown> {
    const row = dbManager.getDb().prepare(`SELECT data FROM derived_results WHERE asset_id = ? AND task = 'embedded_metadata' ORDER BY created_at DESC, rowid DESC LIMIT 1`)
        .get(assetId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as Record<string, unknown> : {};
}

/** Read-only: debug and production use identical source preparation. */
export async function prepareAnalysisInput(params: {
    dbManager: DatabaseManager; row: AnalysisAssetRow; metadataPass?: 'scout' | 'refine'; targets?: RefinementTarget[];
}) {
    const prior = loadAnalysis(params.dbManager, params.row.id);
    const targets = params.targets ?? (params.metadataPass === 'refine'
        ? prior.refinementOpportunities.filter(item => item.expectedValue === 'high' || item.expectedValue === 'medium').slice(0, 4).map(({ field, subjectId, question, concern }) => ({ field, subjectId, question, concern }))
        : []);
    const detailIds = new Set(targets.map(target => target.subjectId).filter(Boolean));
    const details = prior.regions.filter(region => detailIds.has(region.id)).slice(0, 6).map(region => ({ regionId: region.id, box: region.fullPhotoBox }));
    const prepared = await prepareAnalysisImages({ assetId: params.row.id, imagePath: params.row.original_path, faces: loadLocalFaces(params.dbManager, params.row.id), details });
    const localId = `local:${randomUUID()}`;
    const localSource: AnalysisSource = {
        id: localId, assetId: params.row.id, kind: 'local', refId: params.row.id,
        text: `Local file metadata: ${basename(params.row.original_path)}`.slice(0, 180),
    };
    const localClaim: AnalysisClaim = {
        field: 'local_metadata', subjectId: null, kind: 'known_fact', confidence: 'high', supersedesId: null,
        evidence: [], contradictions: [], sourceIds: [localId],
        value: JSON.parse(JSON.stringify({
            orientedGeometry: prepared.dimensions, filename: basename(params.row.original_path), path: params.row.original_path,
            embedded: readEmbedded(params.dbManager, params.row.id), localFaces: prepared.faces,
        })) as Extract<AnalysisClaim, { field: 'local_metadata' }>['value'],
    };
    return { ...prepared, prior, targets, localSource, localClaim };
}
