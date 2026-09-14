import type { CommandHandlerMap } from './types';
import { buildGroupDiagnosticsReport } from '../../shared/utils/groupDiagnosticsModel';
import { getAllCaptureSequencePresentationItems } from '../relationships/libraryCaptureSequencePresentationProjection';

type AssetDiagnosticsRow = {
    asset_id: string;
    original_path: string;
    preview_path: string | null;
};

function buildPresentationMemberships(
    presentationItems: ReturnType<typeof getAllCaptureSequencePresentationItems>,
): Map<string, string[]> {
    const memberships = new Map<string, string[]>();
    for (const item of presentationItems) {
        if (item.assetIds.length <= 1) {continue;}
        for (const assetId of item.assetIds) {
            const current = memberships.get(assetId) ?? [];
            current.push(item.presentationKey);
            memberships.set(assetId, current);
        }
    }
    return memberships;
}

export const groupDiagnosticsCommandHandlers: CommandHandlerMap = {
    get_group_diagnostics_report: (ctx) => {
        const { id, originWs, dbManager, respond } = ctx;

        try {
            const db = dbManager.getDb();
            const presentationItems = getAllCaptureSequencePresentationItems(db);
            const memberships = buildPresentationMemberships(presentationItems);
            const assetRows = db.prepare(`
                SELECT
                    a.id as asset_id,
                    a.original_path,
                    p.path as preview_path
                FROM assets a
                LEFT JOIN previews p ON p.asset_id = a.id AND p.size = 'thumbnail'
                ORDER BY a.id
            `).all() as AssetDiagnosticsRow[];

            const report = buildGroupDiagnosticsReport({
                assets: assetRows.map((asset) => ({
                    assetId: asset.asset_id,
                    originalPath: asset.original_path,
                    previewPath: asset.preview_path,
                    groupIds: memberships.get(asset.asset_id) ?? [],
                })),
                groups: presentationItems
                    .filter((item) => item.assetIds.length > 1)
                    .map((item) => ({
                        groupId: item.presentationKey,
                        groupType: item.relationshipKind ?? 'presentation',
                        representativeAssetId: item.representativeAssetId,
                        assetIds: [...item.assetIds],
                        childGroupIds: [],
                    })),
            });

            respond(id, 'ok', { report }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },
};
