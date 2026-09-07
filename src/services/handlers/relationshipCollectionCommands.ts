import type { LibraryPresentationItem } from '../../boundary/contracts/libraryPresentation';
import {
    getAllCaptureSequencePresentationItems,
    type CaptureSequencePresentationItem,
} from '../relationships/libraryCaptureSequencePresentationProjection';
import {
    setLibraryPresentationCover,
    setLibraryPresentationShowSeparately,
} from '../relationships/libraryPresentationPreferenceRepository';
import { collectionCommandHandlers } from './collectionCommands';
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

async function runLegacyCommand(command: string, ctx: CommandContext): Promise<void> {
    const handler = collectionCommandHandlers[command];
    if (!handler) {
        throw new Error(`Legacy collection command '${command}' is not registered.`);
    }
    await handler(ctx);
}

function orderedMemberIds(item: LibraryPresentationItem): string[] {
    return [
        item.representativeAssetId,
        ...item.assetIds.filter((assetId) => assetId !== item.representativeAssetId),
    ];
}

export const relationshipCollectionCommandHandlers: CommandHandlerMap = {
    get_group_orbit: async (ctx) => {
        const { groupId } = ctx.payload as { groupId: string };
        const item = findPresentationItem(ctx, groupId);
        if (!item) {
            await runLegacyCommand('get_group_orbit', ctx);
            return;
        }

        try {
            const assets = loadRelationshipGalleryRepresentativeAssets({
                dbManager: ctx.dbManager,
                representativeAssetIds: orderedMemberIds(item),
                detailLevel: 'full',
                includeEvidence: false,
            });
            ctx.respond(ctx.id, 'ok', {
                orbit: {
                    group_id: item.presentationKey,
                    group_type: item.relationshipKind,
                    parent_group_id: null,
                    items: assets.map((asset) => ({
                        kind: 'asset',
                        group_id: item.presentationKey,
                        group_type: item.relationshipKind,
                        stack_count: item.stackCount,
                        asset,
                    })),
                },
            }, null, ctx.originWs);
        } catch (error) {
            ctx.respond(
                ctx.id,
                'error',
                null,
                error instanceof Error ? error.message : String(error),
                ctx.originWs,
            );
        }
    },

    explode_group: async (ctx) => {
        const { groupId } = ctx.payload as { groupId: string };
        const item = findPresentationItem(ctx, groupId);
        if (!item) {
            await runLegacyCommand('explode_group', ctx);
            return;
        }

        try {
            setLibraryPresentationShowSeparately(ctx.dbManager.getDb(), item, true);
            ctx.respond(ctx.id, 'ok', { message: 'Presentation will be shown separately' }, null, ctx.originWs);
        } catch (error) {
            ctx.respond(
                ctx.id,
                'error',
                null,
                error instanceof Error ? error.message : String(error),
                ctx.originWs,
            );
        }
    },

    set_canonical: async (ctx) => {
        const { groupId, assetId } = ctx.payload as { groupId: string; assetId: string };
        const item = findPresentationItem(ctx, groupId);
        if (!item) {
            await runLegacyCommand('set_canonical', ctx);
            return;
        }

        try {
            setLibraryPresentationCover(ctx.dbManager.getDb(), item, assetId);
            ctx.respond(ctx.id, 'ok', { message: 'Presentation cover updated' }, null, ctx.originWs);
        } catch (error) {
            ctx.respond(
                ctx.id,
                'error',
                null,
                error instanceof Error ? error.message : String(error),
                ctx.originWs,
            );
        }
    },
};
