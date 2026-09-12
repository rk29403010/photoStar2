import type { DatabaseManager } from '../../data/db';
import {
    getArchiveRepresentationsForAsset,
    type ArchiveRepresentation,
} from './archiveRepresentationRepository';
import {
    putSemanticProposition,
    recordSemanticDecision,
    resolveSemanticScope,
} from './semanticRepository';
import type { SemanticSourceKind } from './semanticTypes';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type PhotographMembershipStatus = 'resolved' | 'unresolved' | 'disputed';
export type PhotographMembershipSource =
    | 'direct_representation'
    | 'exact_copy'
    | 'semantic_decision'
    | 'none';

export type PhotographMembershipResolution = {
    memberKind: 'asset' | 'visual_region';
    memberId: string;
    status: PhotographMembershipStatus;
    photographEntityId: string | null;
    candidatePhotographEntityIds: string[];
    source: PhotographMembershipSource;
    sourceRepresentationId: string | null;
    sourceAssetId: string | null;
    decisionId: string | null;
};

export type RecordVisualRegionPhotographMembershipInput = {
    visualRegionId: string;
    photographEntityId: string;
    sourceKind: Exclude<SemanticSourceKind, 'machine'>;
    sourceRef?: string | null;
    rationale?: string | null;
};

type PropositionMembershipRow = {
    subject_entity_id: string;
    predicate: string;
    object_type: string;
    object_entity_id: string | null;
    object_kind: string | null;
};

const REPRESENTATION_PRIORITY: Readonly<Record<ArchiveRepresentation['representationKind'], number>> = {
    derived_edit: 0,
    crop: 1,
    scan: 2,
    original: 3,
    extracted_frame: 4,
    reference: 5,
};

function uniqueSorted(values: Iterable<string>): string[] {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function preferredRepresentation(representations: readonly ArchiveRepresentation[]): ArchiveRepresentation | null {
    return [...representations].sort((left, right) => {
        const priority = REPRESENTATION_PRIORITY[left.representationKind] - REPRESENTATION_PRIORITY[right.representationKind];
        if (priority !== 0) {
            return priority;
        }
        const assetOrder = left.currentAssetId.localeCompare(right.currentAssetId);
        return assetOrder !== 0 ? assetOrder : left.id.localeCompare(right.id);
    })[0] ?? null;
}

function photographRepresentationsForAsset(db: DbHandle, assetId: string): ArchiveRepresentation[] {
    return getArchiveRepresentationsForAsset(db, assetId)
        .filter((representation) => representation.subjectKind === 'photograph');
}

function assetResolutionFromRepresentations(
    assetId: string,
    representations: readonly ArchiveRepresentation[],
    source: Extract<PhotographMembershipSource, 'direct_representation' | 'exact_copy'>,
): PhotographMembershipResolution {
    const candidateIds = uniqueSorted(representations.map((representation) => representation.subjectEntityId));
    const resolved = candidateIds.length === 1;
    const preferred = resolved
        ? preferredRepresentation(representations.filter((representation) => representation.subjectEntityId === candidateIds[0]))
        : null;
    return {
        memberKind: 'asset',
        memberId: assetId,
        status: resolved ? 'resolved' : 'disputed',
        photographEntityId: resolved ? candidateIds[0]! : null,
        candidatePhotographEntityIds: candidateIds,
        source,
        sourceRepresentationId: preferred?.id ?? null,
        sourceAssetId: preferred?.currentAssetId ?? null,
        decisionId: null,
    };
}

function unresolvedAssetMembership(assetId: string): PhotographMembershipResolution {
    return {
        memberKind: 'asset',
        memberId: assetId,
        status: 'unresolved',
        photographEntityId: null,
        candidatePhotographEntityIds: [],
        source: 'none',
        sourceRepresentationId: null,
        sourceAssetId: null,
        decisionId: null,
    };
}

function exactCopyPhotographRepresentations(db: DbHandle, assetId: string): ArchiveRepresentation[] {
    const asset = db.prepare('SELECT file_hash FROM assets WHERE id = ?').get(assetId) as { file_hash: string | null } | undefined;
    if (!asset) {
        throw new Error(`Asset '${assetId}' was not found.`);
    }
    if (!asset.file_hash) {
        return [];
    }
    const peers = db.prepare(`
        SELECT id
        FROM assets
        WHERE file_hash = ? AND id <> ?
        ORDER BY id ASC
    `).all(asset.file_hash, assetId) as Array<{ id: string }>;
    return peers.flatMap((peer) => photographRepresentationsForAsset(db, peer.id));
}

/**
 * Authoritative current whole-Asset -> Photograph resolution.
 *
 * Direct archive representations own explicit membership. When the current
 * Asset has none, exact file copies inherit a unique resolved Photograph from
 * digest-equivalent peers without persisting another membership store.
 */
export function resolveAssetPhotographMembership(db: DbHandle, assetId: string): PhotographMembershipResolution {
    const direct = photographRepresentationsForAsset(db, assetId);
    if (direct.length > 0) {
        return assetResolutionFromRepresentations(assetId, direct, 'direct_representation');
    }
    const exactCopy = exactCopyPhotographRepresentations(db, assetId);
    return exactCopy.length > 0
        ? assetResolutionFromRepresentations(assetId, exactCopy, 'exact_copy')
        : unresolvedAssetMembership(assetId);
}

export function visualRegionPhotographMembershipScopeKey(visualRegionId: string): string {
    return `photograph-membership:visual-region:${visualRegionId}`;
}

function loadMembershipProposition(db: DbHandle, propositionId: string): PropositionMembershipRow {
    const row = db.prepare(`
        SELECT
            p.subject_entity_id,
            p.predicate,
            p.object_type,
            p.object_entity_id,
            object_entity.kind AS object_kind
        FROM semantic_propositions p
        LEFT JOIN semantic_entities object_entity ON object_entity.id = p.object_entity_id
        WHERE p.id = ?
    `).get(propositionId) as PropositionMembershipRow | undefined;
    if (!row) {
        throw new Error(`Unknown Photograph membership proposition '${propositionId}'.`);
    }
    return row;
}

function assertVisualRegionExists(db: DbHandle, visualRegionId: string): void {
    const row = db.prepare(`
        SELECT vr.id
        FROM visual_regions vr
        JOIN semantic_entities entity ON entity.id = vr.id
        WHERE vr.id = ? AND entity.kind = 'region'
    `).get(visualRegionId);
    if (!row) {
        throw new Error(`VisualRegion '${visualRegionId}' was not found.`);
    }
}

function assertPhotographEntity(db: DbHandle, photographEntityId: string): void {
    const row = db.prepare(`
        SELECT id FROM semantic_entities WHERE id = ? AND kind = 'photograph'
    `).get(photographEntityId);
    if (!row) {
        throw new Error(`Photograph '${photographEntityId}' was not found.`);
    }
}

function photographCandidateFromProposition(
    db: DbHandle,
    visualRegionId: string,
    propositionId: string,
): string | null {
    const proposition = loadMembershipProposition(db, propositionId);
    if (
        proposition.subject_entity_id !== visualRegionId
        || proposition.predicate !== 'represents_photograph'
        || proposition.object_type !== 'entity'
        || proposition.object_kind !== 'photograph'
    ) {
        return null;
    }
    return proposition.object_entity_id;
}

/**
 * Authoritative current VisualRegion -> Photograph resolution.
 *
 * Propositions/attestations remain evidence and history. Only the current
 * accepted semantic decision becomes resolved membership, so a machine or
 * human proposal cannot silently create a second editable source of truth.
 */
export function resolveVisualRegionPhotographMembership(
    db: DbHandle,
    visualRegionId: string,
): PhotographMembershipResolution {
    assertVisualRegionExists(db, visualRegionId);
    const scopeKey = visualRegionPhotographMembershipScopeKey(visualRegionId);
    const semanticResolution = resolveSemanticScope(db, scopeKey);
    const candidates = uniqueSorted(
        semanticResolution.candidatePropositionIds
            .map((propositionId) => photographCandidateFromProposition(db, visualRegionId, propositionId))
            .filter((entityId): entityId is string => entityId !== null),
    );
    const acceptedPhotograph = semanticResolution.status === 'accepted' && semanticResolution.propositionId
        ? photographCandidateFromProposition(db, visualRegionId, semanticResolution.propositionId)
        : null;
    return {
        memberKind: 'visual_region',
        memberId: visualRegionId,
        status: acceptedPhotograph
            ? 'resolved'
            : semanticResolution.status === 'disputed' ? 'disputed' : 'unresolved',
        photographEntityId: acceptedPhotograph,
        candidatePhotographEntityIds: candidates,
        source: acceptedPhotograph ? 'semantic_decision' : 'none',
        sourceRepresentationId: null,
        sourceAssetId: null,
        decisionId: acceptedPhotograph ? semanticResolution.decisionId : null,
    };
}

/** Record an append-only resolution event; no mutable region-membership table exists. */
export function recordVisualRegionPhotographMembership(
    db: DbHandle,
    input: RecordVisualRegionPhotographMembershipInput,
): string {
    assertVisualRegionExists(db, input.visualRegionId);
    assertPhotographEntity(db, input.photographEntityId);
    const scopeKey = visualRegionPhotographMembershipScopeKey(input.visualRegionId);
    const propositionId = putSemanticProposition(db, {
        scopeKey,
        subjectEntityId: input.visualRegionId,
        predicate: 'represents_photograph',
        object: { type: 'entity', entityId: input.photographEntityId },
    });
    recordSemanticDecision(db, {
        scopeKey,
        status: 'accepted',
        propositionId,
        sourceKind: input.sourceKind,
        sourceRef: input.sourceRef ?? null,
        rationale: input.rationale ?? null,
    });
    return propositionId;
}
