import type { DatabaseManager } from '../../../data/db';
import type { ModuleDefinition } from '../contracts';
import { ensureGroupingPrerequisites } from './grouping/groupingAssetPrep';
import {
    rebuildImpactedBurstGroups,
    rebuildImpactedDuplicateGroups,
    rebuildImpactedVariantGroups,
} from './grouping/groupingPersistence';
import { buildBurstGroupingGraph, buildVariantGroupingGraph } from './grouping/groupingQueries';

export interface GroupSimilarPhotosModuleOptions {
    dbManager: DatabaseManager;
}

export function createGroupSimilarPhotosModule(options: GroupSimilarPhotosModuleOptions): ModuleDefinition {
    return {
        id: 'runtime.group_similar_photos',
        version: 1,
        capability: 'group',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'similar_group', subjectType: 'asset' }],
        run: async (context) => {
            if (context.batchSubjects.length === 0) {
                return { outputs: [{ kind: 'artifact', artifactType: 'similar_group', subjectType: 'asset' }] };
            }

            const db = options.dbManager.getDb();
            const assetIds = context.batchSubjects.map((subject) => subject.subjectId);
            const preparedAssets = await ensureGroupingPrerequisites({
                db,
                assetIds,
            });

            rebuildImpactedDuplicateGroups({
                db,
                changedAssetIds: preparedAssets.map((asset) => asset.id),
            });
            const burstGraph = buildBurstGroupingGraph({
                db,
                changedAssetIds: preparedAssets.map((asset) => asset.id),
                maxSeconds: 3,
                maxDistance: 12,
            });
            rebuildImpactedBurstGroups({
                db,
                assets: burstGraph.assets,
                components: burstGraph.components,
                maxSeconds: 3,
                maxDistance: 12,
            });
            const variantThreshold = 10;
            const variantGraph = buildVariantGroupingGraph({
                db,
                changedAssetIds: preparedAssets.map((asset) => asset.id),
                threshold: variantThreshold,
            });
            rebuildImpactedVariantGroups({
                db,
                assets: variantGraph.assets,
                edges: variantGraph.edges,
                components: variantGraph.components,
                threshold: variantThreshold,
            });

            return { outputs: [{ kind: 'artifact', artifactType: 'similar_group', subjectType: 'asset' }] };
        },
    };
}
