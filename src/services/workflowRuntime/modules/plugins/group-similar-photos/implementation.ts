import type { DatabaseManager } from '../../../../../data/db';
import type { ModuleDefinition } from '../../../contracts';
import { ensureGroupingPrerequisites } from '../../grouping/groupingAssetPrep';
import { syncBurstCaptureSequenceProposals } from '../../grouping/captureSequenceProjection';
import { buildIncrementalGroupFreeGroupingPipeline } from '../../grouping/groupFreeIncrementalPipeline';
import { syncVisualSimilarityObservations } from '../../grouping/visualSimilarityProjection';

export type GroupSimilarPhotosModuleOptions = {
    dbManager: DatabaseManager;
}

type DbHandle = ReturnType<DatabaseManager['getDb']>;

const NEAR_DUPLICATE_THRESHOLD = 2;
const VARIANT_THRESHOLD = 6;
const BURST_MAX_SECONDS = 3;
const BURST_MAX_DISTANCE = 12;

function syncGroupFreeDetectorOutputs(db: DbHandle, changedAssetIds: string[]): void {
    const semanticPipeline = buildIncrementalGroupFreeGroupingPipeline(db, changedAssetIds);
    syncVisualSimilarityObservations({
        db,
        nearDuplicate: {
            changedAssetIds: semanticPipeline.refresh.nearDuplicate.impactedAssetIds,
            graph: {
                units: semanticPipeline.refresh.nearDuplicate.graph.units,
                edges: semanticPipeline.refresh.nearDuplicate.graph.edges,
                threshold: NEAR_DUPLICATE_THRESHOLD,
            },
        },
        variant: {
            changedAssetIds: semanticPipeline.refresh.variant.impactedAssetIds,
            graph: {
                units: semanticPipeline.refresh.variant.graph.units,
                edges: semanticPipeline.refresh.variant.graph.edges,
                threshold: VARIANT_THRESHOLD,
            },
        },
    });
    syncBurstCaptureSequenceProposals({
        db,
        changedAssetIds: semanticPipeline.refresh.burst.impactedAssetIds,
        units: semanticPipeline.refresh.burst.graph.units,
        edges: semanticPipeline.refresh.burst.graph.edges,
        components: semanticPipeline.refresh.burst.graph.components,
        maxSeconds: BURST_MAX_SECONDS,
        maxDistance: BURST_MAX_DISTANCE,
    });
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

            syncGroupFreeDetectorOutputs(db, changedAssetIds);

            return { outputs: [{ kind: 'artifact', artifactType: 'similar_group', subjectType: 'asset' }] };
        },
    };
}
