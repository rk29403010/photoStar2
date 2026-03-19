import type { CommandHandlerMap } from './types';
import { buildGroupDiagnosticsReport } from '../../shared/utils/groupDiagnosticsModel';

type AssetDiagnosticsRow = {
    asset_id: string;
    original_path: string;
    preview_path: string | null;
    group_ids_json: string | null;
};

type GroupDiagnosticsRow = {
    group_id: string;
    group_type: string;
    canonical_asset_id: string | null;
    asset_ids_json: string | null;
    child_group_ids_json: string | null;
};

function parseJsonArray(value: string | null) {
    if (!value) {return [];}

    try {
        return JSON.parse(value) as string[];
    } catch {
        return [];
    }
}

export const groupDiagnosticsCommandHandlers: CommandHandlerMap = {
    get_group_diagnostics_report: (ctx) => {
        const { id, originWs, dbManager, respond } = ctx;

        try {
            const db = dbManager.getDb();
            const assetRows = db.prepare(`
                SELECT
                    a.id as asset_id,
                    a.original_path,
                    p.path as preview_path,
                    (
                        SELECT json_group_array(m.group_id)
                        FROM asset_group_members m
                        WHERE m.asset_id = a.id
                        ORDER BY m.group_id
                    ) as group_ids_json
                FROM assets a
                LEFT JOIN previews p ON p.asset_id = a.id AND p.size = 'thumbnail'
                ORDER BY a.id
            `).all() as AssetDiagnosticsRow[];

            const groupRows = db.prepare(`
                SELECT
                    g.id as group_id,
                    g.type as group_type,
                    g.canonical_asset_id as canonical_asset_id,
                    (
                        SELECT json_group_array(m.asset_id)
                        FROM asset_group_members m
                        WHERE m.group_id = g.id
                        ORDER BY
                            CASE WHEN m.role = 'canonical' THEN 0 ELSE 1 END,
                            COALESCE(m.rank, 999999),
                            m.asset_id
                    ) as asset_ids_json
                    ,
                    (
                        SELECT json_group_array(c.child_group_id)
                        FROM asset_group_children c
                        WHERE c.parent_group_id = g.id
                        ORDER BY COALESCE(c.rank, 999999), c.child_group_id
                    ) as child_group_ids_json
                FROM asset_groups g
                ORDER BY g.id
            `).all() as GroupDiagnosticsRow[];

            const report = buildGroupDiagnosticsReport({
                assets: assetRows.map((asset) => ({
                    assetId: asset.asset_id,
                    originalPath: asset.original_path,
                    previewPath: asset.preview_path,
                    groupIds: parseJsonArray(asset.group_ids_json),
                })),
                groups: groupRows.map((group) => ({
                    groupId: group.group_id,
                    groupType: group.group_type,
                    representativeAssetId: group.canonical_asset_id,
                    assetIds: parseJsonArray(group.asset_ids_json),
                    childGroupIds: parseJsonArray(group.child_group_ids_json),
                })),
            });

            respond(id, 'ok', { report }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },
};
