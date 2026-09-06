import type { DatabaseManager } from '../../../../data/db';
import {
    replaceSystemCaptureSequenceProposals,
    type CaptureSequenceProposalInput,
    type CaptureSequenceProposalMemberInput,
} from '../../../relationships/captureSequenceRepository';
import type { GroupingSimilarityEdge } from './groupingQueries';
import type { SimilarityGroupingUnit } from './groupingUnits';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type AssetCaptureTimeRow = {
    id: string;
    exif_datetime: string | null;
};

const BURST_SEQUENCE_SOURCE_IDENTITY = 'runtime.group_similar_photos:burst';
const BURST_SEQUENCE_SOURCE_REF = 'runtime.group_similar_photos@1';
const BURST_SEQUENCE_ALGORITHM_VERSION = '1.0';

function loadAssetCaptureTimes(db: DbHandle, assetIds: readonly string[]): Map<string, string | null> {
    const uniqueIds = [...new Set(assetIds)];
    if (uniqueIds.length === 0) {
        return new Map();
    }
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT id, exif_datetime
        FROM assets
        WHERE id IN (${placeholders})
    `).all(...uniqueIds) as AssetCaptureTimeRow[];
    return new Map(rows.map((row) => [row.id, row.exif_datetime]));
}

function secondsApart(left: SimilarityGroupingUnit, right: SimilarityGroupingUnit): number | null {
    if (!left.exifDatetime || !right.exifDatetime) {
        return null;
    }
    return Math.abs(Date.parse(right.exifDatetime) - Date.parse(left.exifDatetime)) / 1000;
}

function buildIncidentEdgeEvidence(
    unit: SimilarityGroupingUnit,
    unitById: ReadonlyMap<string, SimilarityGroupingUnit>,
    edges: readonly GroupingSimilarityEdge[],
): Array<Record<string, unknown>> {
    const evidence: Array<Record<string, unknown>> = [];
    for (const edge of edges) {
        let otherUnitId: string | null = null;
        if (edge.leftId === unit.unitId) {
            otherUnitId = edge.rightId;
        } else if (edge.rightId === unit.unitId) {
            otherUnitId = edge.leftId;
        }
        if (!otherUnitId) {
            continue;
        }
        const otherUnit = unitById.get(otherUnitId);
        evidence.push({
            otherUnitId,
            score: edge.score,
            perceptualHashDistance: edge.distance,
            secondsApart: otherUnit ? secondsApart(unit, otherUnit) : null,
        });
    }
    return evidence.sort((left, right) => String(left.otherUnitId).localeCompare(String(right.otherUnitId)));
}

function buildMember(
    assetId: string,
    unit: SimilarityGroupingUnit,
    assetCaptureTimes: ReadonlyMap<string, string | null>,
    unitById: ReadonlyMap<string, SimilarityGroupingUnit>,
    edges: readonly GroupingSimilarityEdge[],
): CaptureSequenceProposalMemberInput {
    return {
        assetId,
        capturedAt: assetCaptureTimes.get(assetId) ?? unit.exifDatetime,
        evidence: {
            detectorUnitId: unit.unitId,
            detectorRepresentativeAssetId: unit.representativeAssetId,
            detectorUnitMemberAssetIds: [...unit.memberAssetIds].sort((left, right) => left.localeCompare(right)),
            incidentEdges: buildIncidentEdgeEvidence(unit, unitById, edges),
        },
    };
}

function buildProposal(
    component: readonly string[],
    unitById: ReadonlyMap<string, SimilarityGroupingUnit>,
    edges: readonly GroupingSimilarityEdge[],
    assetCaptureTimes: ReadonlyMap<string, string | null>,
): CaptureSequenceProposalInput | null {
    const units = component
        .map((unitId) => unitById.get(unitId))
        .filter((unit): unit is SimilarityGroupingUnit => Boolean(unit));
    if (units.length < 2) {
        return null;
    }

    return {
        members: units.flatMap((unit) => unit.memberAssetIds.map((assetId) => buildMember(
            assetId,
            unit,
            assetCaptureTimes,
            unitById,
            edges,
        ))),
        evidence: {
            detector: 'burst_connected_component',
            detectorUnitIds: units.map((unit) => unit.unitId).sort((left, right) => left.localeCompare(right)),
            transitiveComponent: true,
        },
    };
}

export function syncBurstCaptureSequenceProposals(params: {
    db: DbHandle;
    changedAssetIds: string[];
    units: SimilarityGroupingUnit[];
    edges: GroupingSimilarityEdge[];
    components: string[][];
    maxSeconds: number;
    maxDistance: number;
}): string[] {
    const unitById = new Map(params.units.map((unit) => [unit.unitId, unit]));
    const allMemberAssetIds = params.units.flatMap((unit) => unit.memberAssetIds);
    const assetCaptureTimes = loadAssetCaptureTimes(params.db, allMemberAssetIds);
    const sequences = params.components
        .map((component) => buildProposal(component, unitById, params.edges, assetCaptureTimes))
        .filter((proposal): proposal is CaptureSequenceProposalInput => Boolean(proposal));

    return replaceSystemCaptureSequenceProposals(params.db, {
        impactedAssetIds: params.changedAssetIds,
        sourceIdentity: BURST_SEQUENCE_SOURCE_IDENTITY,
        sourceRef: BURST_SEQUENCE_SOURCE_REF,
        algorithmVersion: BURST_SEQUENCE_ALGORITHM_VERSION,
        params: {
            maxSeconds: params.maxSeconds,
            maxPerceptualHashDistance: params.maxDistance,
        },
        sequences,
    });
}
