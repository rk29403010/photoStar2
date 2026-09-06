import { createHash } from 'node:crypto';
import type { DatabaseManager } from '../../../../data/db';
import {
    selectDuplicateRepresentative,
    selectNearDuplicateRepresentative,
    selectVariantRepresentative,
} from './groupingHierarchy';
import {
    buildBurstGroupingGraphFromUnits,
    buildNearDuplicateGroupingGraphFromUnits,
    buildVariantGroupingGraphFromUnits,
    type GroupingGraph,
} from './groupingQueries';
import {
    buildRawSimilarityUnits,
    type SimilarityGroupingUnit,
} from './groupingUnits';

type DbHandle = ReturnType<DatabaseManager['getDb']>;
type DerivedStage = 'duplicate' | 'near_duplicate' | 'variant';

type RepresentativeCandidate = {
    id: string;
    originalPath: string;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime: string | null;
};

type RepresentativeSelector = (assets: RepresentativeCandidate[]) => RepresentativeCandidate;

export type GroupFreeGroupingPipeline = {
    rawUnits: SimilarityGroupingUnit[];
    exactUnits: SimilarityGroupingUnit[];
    nearGraph: GroupingGraph;
    nearUnits: SimilarityGroupingUnit[];
    variantGraph: GroupingGraph;
    variantUnits: SimilarityGroupingUnit[];
    burstGraph: GroupingGraph;
};

function stableUnitId(stage: DerivedStage, assetIds: readonly string[]): string {
    const digest = createHash('sha256')
        .update([...assetIds].sort((left, right) => left.localeCompare(right)).join('\n'))
        .digest('hex');
    return `derived:${stage}:${digest}`;
}

function toRepresentativeCandidate(unit: SimilarityGroupingUnit): RepresentativeCandidate {
    return {
        id: unit.representativeAssetId,
        originalPath: unit.originalPath,
        fileSize: unit.fileSize,
        width: unit.width,
        height: unit.height,
        exifDatetime: unit.exifDatetime,
    };
}

function selectRepresentativeUnit(
    units: readonly SimilarityGroupingUnit[],
    selector: RepresentativeSelector,
): SimilarityGroupingUnit {
    const selected = selector(units.map(toRepresentativeCandidate));
    const representative = units.find((unit) => unit.representativeAssetId === selected.id);
    if (!representative) {
        throw new Error(`Unable to resolve grouping representative '${selected.id}'.`);
    }
    return representative;
}

function buildDerivedUnit(
    stage: DerivedStage,
    units: readonly SimilarityGroupingUnit[],
    selector: RepresentativeSelector,
): SimilarityGroupingUnit {
    const representative = selectRepresentativeUnit(units, selector);
    const memberAssetIds = [...new Set(units.flatMap((unit) => unit.memberAssetIds))]
        .sort((left, right) => left.localeCompare(right));
    return {
        ...representative,
        unitId: stableUnitId(stage, memberAssetIds),
        sourceGroupId: null,
        memberAssetIds,
    };
}

function collapseExactCopies(units: readonly SimilarityGroupingUnit[]): SimilarityGroupingUnit[] {
    const byHash = new Map<string, SimilarityGroupingUnit[]>();
    for (const unit of units) {
        if (!unit.fileHash) {
            continue;
        }
        const members = byHash.get(unit.fileHash) ?? [];
        members.push(unit);
        byHash.set(unit.fileHash, members);
    }

    const consumedIds = new Set<string>();
    const result: SimilarityGroupingUnit[] = [];
    for (const members of byHash.values()) {
        if (members.length < 2) {
            continue;
        }
        result.push(buildDerivedUnit('duplicate', members, selectDuplicateRepresentative));
        for (const member of members) {
            consumedIds.add(member.unitId);
        }
    }
    result.push(...units.filter((unit) => !consumedIds.has(unit.unitId)));
    return result;
}

function collapseGraphComponents(
    units: readonly SimilarityGroupingUnit[],
    graph: GroupingGraph,
    stage: Exclude<DerivedStage, 'duplicate'>,
    selector: RepresentativeSelector,
): SimilarityGroupingUnit[] {
    const byId = new Map(units.map((unit) => [unit.unitId, unit]));
    const consumedIds = new Set<string>();
    const derivedUnits: SimilarityGroupingUnit[] = [];
    for (const component of graph.components) {
        const members = component
            .map((unitId) => byId.get(unitId))
            .filter((unit): unit is SimilarityGroupingUnit => Boolean(unit));
        if (members.length < 2) {
            continue;
        }
        derivedUnits.push(buildDerivedUnit(stage, members, selector));
        for (const member of members) {
            consumedIds.add(member.unitId);
        }
    }
    return [
        ...derivedUnits,
        ...units.filter((unit) => !consumedIds.has(unit.unitId)),
    ];
}

/**
 * Shadow implementation of the current duplicate -> near -> variant -> burst
 * computational hierarchy without reading asset_groups. It deliberately runs
 * across every currently-ready asset so arbitrary-subject workflow runs remain
 * semantically correct while incremental reconstruction is developed separately.
 */
export function buildGroupFreeGroupingPipeline(db: DbHandle): GroupFreeGroupingPipeline {
    const rawUnits = buildRawSimilarityUnits(db);
    const allAssetIds = rawUnits.flatMap((unit) => unit.memberAssetIds);
    const exactUnits = collapseExactCopies(rawUnits);
    const nearGraph = buildNearDuplicateGroupingGraphFromUnits({
        units: exactUnits,
        changedAssetIds: allAssetIds,
        threshold: 2,
    });
    const nearUnits = collapseGraphComponents(
        exactUnits,
        nearGraph,
        'near_duplicate',
        selectNearDuplicateRepresentative,
    );
    const variantGraph = buildVariantGroupingGraphFromUnits({
        units: nearUnits,
        changedAssetIds: allAssetIds,
        threshold: 6,
    });
    const variantUnits = collapseGraphComponents(
        nearUnits,
        variantGraph,
        'variant',
        selectVariantRepresentative,
    );
    const burstGraph = buildBurstGroupingGraphFromUnits({
        units: variantUnits,
        changedAssetIds: allAssetIds,
        maxSeconds: 3,
        maxDistance: 12,
    });

    return {
        rawUnits,
        exactUnits,
        nearGraph,
        nearUnits,
        variantGraph,
        variantUnits,
        burstGraph,
    };
}
