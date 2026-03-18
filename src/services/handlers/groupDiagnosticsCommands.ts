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
    asset_ids_json: string | null;
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
                    (
                        SELECT json_group_array(m.asset_id)
                        FROM asset_group_members m
                        WHERE m.group_id = g.id
                        ORDER BY
                            CASE WHEN m.role = 'canonical' THEN 0 ELSE 1 END,
                            COALESCE(m.rank, 999999),
                            m.asset_id
                    ) as asset_ids_json
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
                    assetIds: parseJsonArray(group.asset_ids_json),
                })),
            });

            respond(id, 'ok', { report }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },
};
