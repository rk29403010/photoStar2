import type { DatabaseManager } from '../../data/db';
import {
    ensureArchiveRepresentation,
    type ArchiveRepresentationKind,
} from './archiveRepresentationRepository';
import { resolveAssetPhotographMembership } from './photographMembershipRepository';
import { ensureSemanticEntity } from './semanticRepository';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type PhotoEditPhotographIntent =
    | 'restoration'
    | 'crop'
    | 'ordinary_edit'
    | 'authored_composite';

export type ProjectPhotoEditRepresentationsInput = {
    sourceAssetId: string;
    renderedAssetId: string;
    editId: string;
    photographIntent?: PhotoEditPhotographIntent;
};

function representationKindForIntent(intent: PhotoEditPhotographIntent): ArchiveRepresentationKind {
    return intent === 'crop' ? 'crop' : 'derived_edit';
}

function projectAuthoredComposite(
    db: DbHandle,
    input: ProjectPhotoEditRepresentationsInput,
    sourceRepresentationId: string | null,
): void {
    const photographEntityId = ensureSemanticEntity(db, {
        kind: 'photograph',
        nativeId: `photo-edit-composite:${input.editId}`,
    });
    ensureArchiveRepresentation(db, {
        assetId: input.renderedAssetId,
        subjectEntityId: photographEntityId,
        representationKind: 'derived_edit',
        sourceKind: 'system',
        sourceRef: `photo-edit:${input.editId}`,
        derivedFromRepresentationId: sourceRepresentationId,
    });
}

/**
 * Project editor lineage into Photograph representation semantics.
 *
 * `photo_edit_documents` remains authoritative for recipes and branch lineage.
 * This projection only answers historical Photograph membership: restoration,
 * crop and ordinary edits inherit a uniquely resolved source Photograph, while
 * an explicitly authored composite starts a stable new Photograph identity.
 */
export function projectPhotoEditRepresentations(
    db: DbHandle,
    input: ProjectPhotoEditRepresentationsInput,
): void {
    const membership = resolveAssetPhotographMembership(db, input.sourceAssetId);
    const intent = input.photographIntent ?? 'ordinary_edit';

    if (intent === 'authored_composite') {
        projectAuthoredComposite(db, input, membership.sourceRepresentationId);
        return;
    }
    if (membership.status !== 'resolved' || !membership.photographEntityId) {
        return;
    }

    ensureArchiveRepresentation(db, {
        assetId: input.renderedAssetId,
        subjectEntityId: membership.photographEntityId,
        representationKind: representationKindForIntent(intent),
        sourceKind: 'system',
        sourceRef: `photo-edit:${input.editId}`,
        derivedFromRepresentationId: membership.sourceRepresentationId,
    });
}
