import type { DatabaseManager } from '../../../../data/db';
import { buildConnectedComponents } from './groupingGraph';
import {
    buildBurstGroupingGraphFromUnits,
    buildNearDuplicateGroupingGraphFromUnits,
    buildVariantGroupingGraphFromUnits,
    type GroupingGraph,
    type GroupingSimilarityEdge,
} from './groupingQueries';
import { buildRawSimilarityUnits, type SimilarityGroupingUnit } from './groupingUnits';
import {
    buildExactCopyUnits,
    collapseNearDuplicateUnits,
    collapseVariantUnits,
    type GroupFreeGroupingPipeline,
} from './groupFreeGroupingPipeline';

type DbHandle = ReturnType<DatabaseManager['getDb']>;
type VisualPolicy = 'near_duplicate' | 'variant';

type ObservationRow = {
    current_asset_id_a: string | null;
    current_asset_id_b: string | null;
    policy: VisualPolicy;
    phash_distance: number;
    score: number;
};

export type GroupFreeRefreshStage = {
    graph: GroupingGraph;
    impactedAssetIds: string[];
};

export type IncrementalGroupFreeGroupingPipeline = GroupFreeGroupingPipeline & {
    refresh: {
        nearDuplicate: GroupFreeRefreshStage;
        variant: GroupFreeRefreshStage;
        burst: GroupFreeRefreshStage;
    };
};

const VISUAL_SOURCE_IDENTITY = 'runtime.group_similar_photos:visual_hash';

function loadObservationRows(db: DbHandle): ObservationRow[] {
    return db.prepare(`
        SELECT
            (
                SELECT asset.id
                FROM assets asset
                JOIN asset_identities identity_a ON identity_a.original_path = asset.original_path
                WHERE identity_a.guid = observation.asset_identity_guid_a
                ORDER BY asset.created_at DESC, asset.id DESC
                LIMIT 1
            ) AS current_asset_id_a,
            (
                SELECT asset.id
                FROM assets asset
                JOIN asset_identities identity_b ON identity_b.original_path = asset.original_path
                WHERE identity_b.guid = observation.asset_identity_guid_b
                ORDER BY asset.created_at DESC, asset.id DESC
                LIMIT 1
            ) AS current_asset_id_b,
            observation.policy,
            observation.phash_distance,
            observation.score
        FROM visual_similarity_observations observation
        WHERE observation.source_identity = ?
        ORDER BY observation.asset_identity_guid_a, observation.asset_identity_guid_b, observation.policy
    `).all(VISUAL_SOURCE_IDENTITY) as ObservationRow[];
}

function indexUnitsByAssetId(units: readonly SimilarityGroupingUnit[]): Map<string, SimilarityGroupingUnit> {
    const byAssetId = new Map<string, SimilarityGroupingUnit>();
    for (const unit of units) {
        for (const assetId of unit.memberAssetIds) {
            byAssetId.set(assetId, unit);
        }
    }
    return byAssetId;
}

function canonicalEdge(
    leftId: string,
    rightId: string,
    distance: number,
    score: number,
): GroupingSimilarityEdge {
    return leftId.localeCompare(rightId) <= 0
        ? { leftId, rightId, distance, score }
        : { leftId: rightId, rightId: leftId, distance, score };
}

function edgeKey(edge: Pick<GroupingSimilarityEdge, 'leftId' | 'rightId'>): string {
    return `${edge.leftId}\n${edge.rightId}`;
}

function buildStoredPolicyEdges(
    rows: readonly ObservationRow[],
    units: readonly SimilarityGroupingUnit[],
    policy: VisualPolicy,
): GroupingSimilarityEdge[] {
    const byAssetId = indexUnitsByAssetId(units);
    const edgesByKey = new Map<string, GroupingSimilarityEdge>();
    for (const row of rows) {
        if (!row.current_asset_id_a || !row.current_asset_id_b) {
            continue;
        }
        if (row.policy !== policy) {
            continue;
        }
        const left = byAssetId.get(row.current_asset_id_a);
        const right = byAssetId.get(row.current_asset_id_b);
        if (!left || !right || left.unitId === right.unitId) {
            continue;
        }
        const edge = canonicalEdge(left.unitId, right.unitId, row.phash_distance, row.score);
        edgesByKey.set(edgeKey(edge), edge);
    }
    return [...edgesByKey.values()];
}

function buildGraph(
    units: readonly SimilarityGroupingUnit[],
    edges: readonly GroupingSimilarityEdge[],
): GroupingGraph {
    const copiedEdges = [...edges];
    return {
        units: [...units],
        edges: copiedEdges,
        components: buildConnectedComponents(
            units.map((unit) => unit.unitId),
            copiedEdges,
        ).filter((component) => component.length > 1),
    };
}

function mergeFreshNeighbourhood(
    units: readonly SimilarityGroupingUnit[],
    storedEdges: readonly GroupingSimilarityEdge[],
    freshGraph: GroupingGraph,
): GroupingGraph {
    const impactedUnitIds = new Set(freshGraph.units.map((unit) => unit.unitId));
    const mergedByKey = new Map<string, GroupingSimilarityEdge>();
    for (const edge of storedEdges) {
        if (impactedUnitIds.has(edge.leftId) || impactedUnitIds.has(edge.rightId)) {
            continue;
        }
        mergedByKey.set(edgeKey(edge), edge);
    }
    for (const edge of freshGraph.edges) {
        mergedByKey.set(edgeKey(edge), edge);
    }
    return buildGraph(units, [...mergedByKey.values()]);
}

function memberAssetIds(units: readonly SimilarityGroupingUnit[]): string[] {
    return [...new Set(units.flatMap((unit) => unit.memberAssetIds))];
}

function refreshAssetIds(seedAssetIds: readonly string[], units: readonly SimilarityGroupingUnit[]): string[] {
    return [...new Set([...seedAssetIds, ...memberAssetIds(units)])];
}

function buildEffectiveNearStage(params: {
    exactUnits: SimilarityGroupingUnit[];
    observations: ObservationRow[];
    changedAssetIds: string[];
}): { graph: GroupingGraph; units: SimilarityGroupingUnit[]; refresh: GroupFreeRefreshStage } {
    const storedEdges = buildStoredPolicyEdges(params.observations, params.exactUnits, 'near_duplicate');
    const freshGraph = buildNearDuplicateGroupingGraphFromUnits({
        units: params.exactUnits,
        changedAssetIds: params.changedAssetIds,
        threshold: 2,
    });
    const graph = mergeFreshNeighbourhood(params.exactUnits, storedEdges, freshGraph);
    return {
        graph,
        units: collapseNearDuplicateUnits(params.exactUnits, graph),
        refresh: {
            graph: freshGraph,
            impactedAssetIds: refreshAssetIds(params.changedAssetIds, freshGraph.units),
        },
    };
}

function buildEffectiveVariantStage(params: {
    nearUnits: SimilarityGroupingUnit[];
    observations: ObservationRow[];
    changedAssetIds: string[];
}): { graph: GroupingGraph; units: SimilarityGroupingUnit[]; refresh: GroupFreeRefreshStage } {
    const storedEdges = buildStoredPolicyEdges(params.observations, params.nearUnits, 'variant');
    const freshGraph = buildVariantGroupingGraphFromUnits({
        units: params.nearUnits,
        changedAssetIds: params.changedAssetIds,
        threshold: 6,
    });
    const graph = mergeFreshNeighbourhood(params.nearUnits, storedEdges, freshGraph);
    return {
        graph,
        units: collapseVariantUnits(params.nearUnits, graph),
        refresh: {
            graph: freshGraph,
            impactedAssetIds: refreshAssetIds(params.changedAssetIds, freshGraph.units),
        },
    };
}

/**
 * Incremental group-free detector model. Stored visual observations reconstruct
 * unaffected lower-level units while changed neighbourhoods are recalculated
 * from current hashes. The refresh plan contains only the neighbourhoods that
 * should replace durable detector observations. No asset_groups rows are read.
 */
export function buildIncrementalGroupFreeGroupingPipeline(
    db: DbHandle,
    changedAssetIds: string[],
): IncrementalGroupFreeGroupingPipeline {
    const rawUnits = buildRawSimilarityUnits(db);
    const exactUnits = buildExactCopyUnits(rawUnits);
    const observations = loadObservationRows(db);
    const near = buildEffectiveNearStage({ exactUnits, observations, changedAssetIds });
    const variant = buildEffectiveVariantStage({
        nearUnits: near.units,
        observations,
        changedAssetIds: near.refresh.impactedAssetIds,
    });
    const burstGraph = buildBurstGroupingGraphFromUnits({
        units: variant.units,
        changedAssetIds: variant.refresh.impactedAssetIds,
        maxSeconds: 3,
        maxDistance: 12,
    });
    const burstRefresh: GroupFreeRefreshStage = {
        graph: burstGraph,
        impactedAssetIds: refreshAssetIds(variant.refresh.impactedAssetIds, burstGraph.units),
    };

    return {
        rawUnits,
        exactUnits,
        nearGraph: near.graph,
        nearUnits: near.units,
        variantGraph: variant.graph,
        variantUnits: variant.units,
        burstGraph,
        refresh: {
            nearDuplicate: near.refresh,
            variant: variant.refresh,
            burst: burstRefresh,
        },
    };
}
