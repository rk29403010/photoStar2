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
    type SimilarityGroupingMemberEvidence,
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

function fallbackMemberEvidence(unit: SimilarityGroupingUnit): SimilarityGroupingMemberEvidence {
    return {
        assetId: unit.representativeAssetId,
        exifDatetime: unit.exifDatetime,
        phash64: unit.phash64,
        dhash64: unit.dhash64,
    };
}

function collectMemberEvidence(units: readonly SimilarityGroupingUnit[]): SimilarityGroupingMemberEvidence[] {
    const byAssetId = new Map<string, SimilarityGroupingMemberEvidence>();
    for (const unit of units) {
        const evidence = unit.memberEvidence?.length
            ? unit.memberEvidence
            : [fallbackMemberEvidence(unit)];
        for (const member of evidence) {
            byAssetId.set(member.assetId, member);
        }
    }
    return [...byAssetId.values()]
        .sort((left, right) => left.assetId.localeCompare(right.assetId));
}

function buildDerivedUnit(
    stage: DerivedStage,
    units: readonly SimilarityGroupingUnit[],
    selector: RepresentativeSelector,
): SimilarityGroupingUnit {
    const representative = selectRepresentativeUnit(units, selector);
    const memberAssetIds = [...new Set(units.flatMap((unit) => unit.memberAssetIds))]
        .sort((left, right) => left.localeCompare(right));
    const memberEvidence = collectMemberEvidence(units);
    const exactVisualEvidence = stage === 'duplicate' && (!representative.phash64 || !representative.dhash64)
        ? units.find((unit) => Boolean(unit.phash64 && unit.dhash64))
        : undefined;
    return {
        ...representative,
        unitId: stableUnitId(stage, memberAssetIds),
        sourceGroupId: null,
        memberAssetIds,
        phash64: exactVisualEvidence?.phash64 ?? representative.phash64,
        dhash64: exactVisualEvidence?.dhash64 ?? representative.dhash64,
        memberEvidence,
    };
}

export function buildExactCopyUnits(units: readonly SimilarityGroupingUnit[]): SimilarityGroupingUnit[] {
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

export function collapseNearDuplicateUnits(
    units: readonly SimilarityGroupingUnit[],
    graph: GroupingGraph,
): SimilarityGroupingUnit[] {
    return collapseGraphComponents(units, graph, 'near_duplicate', selectNearDuplicateRepresentative);
}

export function collapseVariantUnits(
    units: readonly SimilarityGroupingUnit[],
    graph: GroupingGraph,
): SimilarityGroupingUnit[] {
    return collapseGraphComponents(units, graph, 'variant', selectVariantRepresentative);
}

/**
 * Shadow implementation of the current duplicate -> near -> variant -> burst
 * computational hierarchy without reading legacy grouping tables. It deliberately
 * runs across every currently-ready asset so arbitrary-subject workflow runs remain
 * semantically correct while incremental reconstruction is developed separately.
 */
export function buildGroupFreeGroupingPipeline(db: DbHandle): GroupFreeGroupingPipeline {
    const rawUnits = buildRawSimilarityUnits(db);
    const allAssetIds = rawUnits.flatMap((unit) => unit.memberAssetIds);
    const exactUnits = buildExactCopyUnits(rawUnits);
    const nearGraph = buildNearDuplicateGroupingGraphFromUnits({
        units: exactUnits,
        changedAssetIds: allAssetIds,
        threshold: 2,
    });
    const nearUnits = collapseNearDuplicateUnits(exactUnits, nearGraph);
    const variantGraph = buildVariantGroupingGraphFromUnits({
        units: nearUnits,
        changedAssetIds: allAssetIds,
        threshold: 6,
    });
    const variantUnits = collapseVariantUnits(nearUnits, variantGraph);
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
