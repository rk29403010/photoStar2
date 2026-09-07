import type { FaceBox } from '../../boundary/contracts/core';
import type {
    LibraryPresentationExpansion,
    LibraryPresentationItem,
} from '../../boundary/contracts/libraryPresentation';
import {
    getAllCaptureSequencePresentationItems,
    type CaptureSequencePresentationItem,
} from '../relationships/libraryCaptureSequencePresentationProjection';
import {
    setLibraryPresentationCover,
    setLibraryPresentationShowSeparately,
} from '../relationships/libraryPresentationPreferenceRepository';
import { loadRelationshipGalleryRepresentativeAssets } from './relationshipGalleryAssetLoader';
import type { CommandContext, CommandHandlerMap } from './types';

function toPresentationItem(item: CaptureSequencePresentationItem): LibraryPresentationItem {
    return {
        presentationKey: item.presentationKey,
        representativeAssetId: item.representativeAssetId,
        relationshipKind: item.relationshipKind,
        stackCount: item.stackCount,
        assetIds: [...item.assetIds],
        momentCount: item.momentCount,
    };
}

function findPresentationItem(ctx: CommandContext, presentationKey: string): LibraryPresentationItem | null {
    const item = getAllCaptureSequencePresentationItems(ctx.dbManager.getDb())
        .find((candidate) => candidate.presentationKey === presentationKey);
    return item ? toPresentationItem(item) : null;
}

function requirePresentationItem(ctx: CommandContext, presentationKey: string): LibraryPresentationItem {
    const item = findPresentationItem(ctx, presentationKey);
    if (!item) {
        throw new Error(`Library presentation '${presentationKey}' no longer exists.`);
    }
    return item;
}

function orderedMemberIds(item: LibraryPresentationItem): string[] {
    return [
        item.representativeAssetId,
        ...item.assetIds.filter((assetId) => assetId !== item.representativeAssetId),
    ];
}

function isFaceBox(face: Record<string, unknown>): face is Record<string, unknown> & FaceBox {
    const box = face.box;
    return box !== null
        && typeof box === 'object'
        && 'x' in box
        && typeof box.x === 'number'
        && 'y' in box
        && typeof box.y === 'number'
        && 'width' in box
        && typeof box.width === 'number'
        && 'height' in box
        && typeof box.height === 'number';
}

function buildPresentationExpansion(
    ctx: CommandContext,
    item: LibraryPresentationItem,
): LibraryPresentationExpansion {
    const assets = loadRelationshipGalleryRepresentativeAssets({
        dbManager: ctx.dbManager,
        representativeAssetIds: orderedMemberIds(item),
        detailLevel: 'full',
        includeEvidence: false,
    });
    return {
        presentationKey: item.presentationKey,
        relationshipKind: item.relationshipKind,
        representativeAssetId: item.representativeAssetId,
        stackCount: item.stackCount,
        momentCount: item.momentCount,
        items: assets.map((asset, ordinal) => ({
            asset: {
                ...asset,
                faces: asset.faces.filter(isFaceBox),
            },
            ordinal,
            isRepresentative: asset.id === item.representativeAssetId,
        })),
    };
}

function respondWithError(ctx: CommandContext, error: unknown): void {
    ctx.respond(
        ctx.id,
        'error',
        null,
        error instanceof Error ? error.message : String(error),
        ctx.originWs,
    );
}

export const relationshipCollectionCommandHandlers: CommandHandlerMap = {
    get_library_presentation_expansion: async (ctx) => {
        try {
            const { presentationKey } = ctx.payload as { presentationKey: string };
            const item = requirePresentationItem(ctx, presentationKey);
            const expansion = buildPresentationExpansion(ctx, item);
            ctx.respond(ctx.id, 'ok', { expansion }, null, ctx.originWs);
        } catch (error) {
            respondWithError(ctx, error);
        }
    },

    set_library_presentation_cover: async (ctx) => {
        try {
            const { presentationKey, assetId } = ctx.payload as { presentationKey: string; assetId: string };
            const item = requirePresentationItem(ctx, presentationKey);
            setLibraryPresentationCover(ctx.dbManager.getDb(), item, assetId);
            ctx.respond(ctx.id, 'ok', { message: 'Presentation cover updated' }, null, ctx.originWs);
        } catch (error) {
            respondWithError(ctx, error);
        }
    },

    set_library_presentation_show_separately: async (ctx) => {
        try {
            const { presentationKey, showSeparately = true } = ctx.payload as {
                presentationKey: string;
                showSeparately?: boolean;
            };
            const item = requirePresentationItem(ctx, presentationKey);
            setLibraryPresentationShowSeparately(ctx.dbManager.getDb(), item, showSeparately);
            ctx.respond(ctx.id, 'ok', { showSeparately }, null, ctx.originWs);
        } catch (error) {
            respondWithError(ctx, error);
        }
    },
};
