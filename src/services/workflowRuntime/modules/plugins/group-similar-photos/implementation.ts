import type { DatabaseManager } from '../../../../../data/db';
import type { ModuleDefinition } from '../../../contracts';
import { ensureGroupingPrerequisites } from '../../grouping/groupingAssetPrep';
import { syncBurstCaptureSequenceProposals } from '../../grouping/captureSequenceProjection';
import { buildIncrementalGroupFreeGroupingPipeline } from '../../grouping/groupFreeIncrementalPipeline';
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
            const nearDuplicateThreshold = 2;
            const variantThreshold = 6;
            const burstMaxSeconds = 3;
            const burstMaxDistance = 12;

            // Durable detector outputs are computed without reading asset_groups.
            // Legacy groups remain below as a temporary compatibility projection for
            // consumers that have not yet moved to relationship presentation.
            const semanticPipeline = buildIncrementalGroupFreeGroupingPipeline(db, changedAssetIds);
            syncVisualSimilarityObservations({
                db,
                nearDuplicate: {
                    changedAssetIds: semanticPipeline.refresh.nearDuplicate.impactedAssetIds,
                    graph: {
                        units: semanticPipeline.refresh.nearDuplicate.graph.units,
                        edges: semanticPipeline.refresh.nearDuplicate.graph.edges,
                        threshold: nearDuplicateThreshold,
                    },
                },
                variant: {
                    changedAssetIds: semanticPipeline.refresh.variant.impactedAssetIds,
                    graph: {
                        units: semanticPipeline.refresh.variant.graph.units,
                        edges: semanticPipeline.refresh.variant.graph.edges,
                        threshold: variantThreshold,
                    },
                },
            });
            syncBurstCaptureSequenceProposals({
                db,
                changedAssetIds: semanticPipeline.refresh.burst.impactedAssetIds,
                units: semanticPipeline.refresh.burst.graph.units,
                edges: semanticPipeline.refresh.burst.graph.edges,
                components: semanticPipeline.refresh.burst.graph.components,
                maxSeconds: burstMaxSeconds,
                maxDistance: burstMaxDistance,
            });

            // Temporary legacy gallery compatibility. These writes are downstream
            // of the group-free detector outputs and are not semantic inputs.
            rebuildImpactedDuplicateGroups({ db, changedAssetIds });
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
            const burstGraph = buildBurstGroupingGraph({
                db,
                changedAssetIds,
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