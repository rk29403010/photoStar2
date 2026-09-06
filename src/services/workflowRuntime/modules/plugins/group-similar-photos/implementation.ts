import type { DatabaseManager } from '../../../../../data/db';
import type { ModuleDefinition } from '../../../contracts';
import { ensureGroupingPrerequisites } from '../../grouping/groupingAssetPrep';
import { syncBurstCaptureSequenceProposals } from '../../grouping/captureSequenceProjection';
import {
    rebuildImpactedBurstGroups,
    rebuildImpactedDuplicateGroups,
    rebuildImpactedNearDuplicateGroups,
    rebuildImpactedVariantGroups,
} from '../../grouping/groupingPersistence';
import {
    buildBurstGroupingGraph,
    buildNearDuplicateGroupingGraph,
    buildVariantGroupingGraph,
} from '../../grouping/groupingQueries';
import { syncVisualSimilarityObservations } from '../../grouping/visualSimilarityProjection';

export type GroupSimilarPhotosModuleOptions = {
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
            const preparedAssets = await ensureGroupingPrerequisites({ db, assetIds });
            const changedAssetIds = preparedAssets.map((asset) => asset.id);

            rebuildImpactedDuplicateGroups({ db, changedAssetIds });
            const nearDuplicateThreshold = 2;
            const nearDuplicateGraph = buildNearDuplicateGroupingGraph({
                db,
                changedAssetIds,
                threshold: nearDuplicateThreshold,
            });
            rebuildImpactedNearDuplicateGroups({
                db,
                units: nearDuplicateGraph.units,
                edges: nearDuplicateGraph.edges,
                components: nearDuplicateGraph.components,
                threshold: nearDuplicateThreshold,
            });
            const variantThreshold = 6;
            const variantGraph = buildVariantGroupingGraph({
                db,
                changedAssetIds,
                threshold: variantThreshold,
            });
            rebuildImpactedVariantGroups({
                db,
                units: variantGraph.units,
                edges: variantGraph.edges,
                components: variantGraph.components,
                threshold: variantThreshold,
            });
            syncVisualSimilarityObservations({
                db,
                changedAssetIds,
                nearDuplicateGraph: {
                    units: nearDuplicateGraph.units,
                    edges: nearDuplicateGraph.edges,
                    threshold: nearDuplicateThreshold,
                },
                variantGraph: {
                    units: variantGraph.units,
                    edges: variantGraph.edges,
                    threshold: variantThreshold,
                },
            });
            const burstMaxSeconds = 3;
            const burstMaxDistance = 12;
            const burstGraph = buildBurstGroupingGraph({
                db,
                changedAssetIds,
                maxSeconds: burstMaxSeconds,
                maxDistance: burstMaxDistance,
            });
            syncBurstCaptureSequenceProposals({
                db,
                changedAssetIds,
                units: burstGraph.units,
                edges: burstGraph.edges,
                components: burstGraph.components,
                maxSeconds: burstMaxSeconds,
                maxDistance: burstMaxDistance,
            });
            rebuildImpactedBurstGroups({
                db,
                units: burstGraph.units,
                components: burstGraph.components,
                maxSeconds: burstMaxSeconds,
                maxDistance: burstMaxDistance,
            });

            return { outputs: [{ kind: 'artifact', artifactType: 'similar_group', subjectType: 'asset' }] };
        },
    };
}
