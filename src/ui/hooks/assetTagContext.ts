import type { Asset, AssetTag, ReviewItemSummary, TagDefinitionSummary } from '@contracts/core';
import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';

export interface AssetTagContext {
    tags: AssetTag[];
    pendingReviewItems: ReviewItemSummary[];
}

export function applyAssetTagContext(asset: Asset, tagContext: AssetTagContext): Asset {
    return {
        ...asset,
        tags: tagContext.tags,
        pending_review_items: tagContext.pendingReviewItems,
    };
}

export async function fetchAssetTagContext(request: RequestFn, assetId: string): Promise<AssetTagContext> {
    const [tags, pendingReviewItems] = await Promise.all([
        request<AssetTag[]>({
            idPrefix: `get_asset_tags_${assetId}`,
            command: 'get_asset_tags',
            payload: { assetId },
            timeoutMs: 10000,
            select: (data) => (data?.tags as AssetTag[]) || [],
        }),
        request<ReviewItemSummary[]>({
            idPrefix: `get_asset_review_items_${assetId}`,
            command: 'list_review_items',
            payload: {
                subjectType: 'asset',
                subjectId: assetId,
                reviewItemType: 'tag_proposal',
                status: 'pending',
            },
            timeoutMs: 10000,
            select: (data) => (data?.reviewItems as ReviewItemSummary[]) || [],
        }),
    ]);

    return { tags, pendingReviewItems };
}

export async function fetchAvailableTags(request: RequestFn): Promise<TagDefinitionSummary[]> {
    return request<TagDefinitionSummary[]>({
        idPrefix: 'list_available_tags',
        command: 'list_available_tags',
        timeoutMs: 10000,
        select: (data) => (data?.tags as TagDefinitionSummary[]) || [],
    });
}
