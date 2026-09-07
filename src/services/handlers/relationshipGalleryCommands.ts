import type { GalleryTimelineSeek } from '../../boundary/contracts/core';
import type { AssetDetailLevel } from '../../shared/sql/derivedResults';
import { assetCommandHandlers } from './assetCommands';
import { getGalleryOrder, type AssetGalleryOrder } from './assetGalleryOrder';
import { loadRelationshipGalleryRepresentativeAssets } from './relationshipGalleryAssetLoader';
import { getRelationshipGalleryPresentationPage } from './relationshipGalleryPresentation';
import type { CommandHandlerMap } from './types';

type RelationshipGalleryFilter = {
    personIds?: string[];
    type?: string;
    albumId?: string;
    value?: string;
    tag?: string;
};

type RelationshipGalleryPayload = {
    offset?: number;
    limit?: number;
    withGroupCounts?: boolean;
    filter?: RelationshipGalleryFilter;
    detailLevel?: AssetDetailLevel;
    galleryOrder?: AssetGalleryOrder;
    gallerySeek?: GalleryTimelineSeek | null;
    includeEvidence?: boolean;
};

function getDetailLevel(payload: RelationshipGalleryPayload): AssetDetailLevel {
    return payload.detailLevel === 'gallery' ? 'gallery' : 'full';
}

export const relationshipGalleryCommandHandlers: CommandHandlerMap = {
    get_assets: async (ctx) => {
        const payload = (ctx.payload ?? {}) as RelationshipGalleryPayload;
        if (payload.withGroupCounts === false) {
            await assetCommandHandlers.get_assets(ctx);
            return;
        }

        const limit = payload.limit || 500;
        const offset = payload.offset || 0;
        const galleryOrder = getGalleryOrder(payload);
        const page = getRelationshipGalleryPresentationPage(ctx.dbManager.getDb(), {
            limit,
            offset,
            galleryOrder,
            gallerySeek: payload.gallerySeek,
            filter: payload.filter,
        });
        const assets = loadRelationshipGalleryRepresentativeAssets({
            dbManager: ctx.dbManager,
            representativeAssetIds: page.representativeAssetIds,
            detailLevel: getDetailLevel(payload),
            includeEvidence: payload.includeEvidence === true,
        });

        ctx.respond(ctx.id, 'ok', {
            assets,
            presentationItems: page.items,
            hasMore: page.hasMore,
            total: page.total,
            limit,
            offset,
        }, null, ctx.originWs);
    },
};
