import type { Asset } from '@contracts/core';
import type {
    LibraryPresentationExpansion,
    LibraryPresentationExpansionItem,
    LibraryPresentationRelationshipKind,
} from '@contracts/libraryPresentation';
import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import type { RefreshLibraryOptions } from '@ui/hooks/usePhotoLibrary.gallery';

type LibraryPresentationActionParams = {
    request: RequestFn;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRelationshipKind(value: unknown): LibraryPresentationRelationshipKind {
    if (
        value === null
        || value === 'edit_lineage'
        || value === 'exact_copy'
        || value === 'near_duplicate'
        || value === 'variant'
        || value === 'capture_sequence'
    ) {
        return value;
    }
    throw new Error('Invalid library presentation relationship kind.');
}

function parseAsset(value: unknown): Asset {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.original_path !== 'string') {
        throw new Error('Invalid asset in library presentation expansion.');
    }
    return {
        ...value,
        id: value.id,
        original_path: value.original_path,
    };
}

function parseExpansionItem(value: unknown): LibraryPresentationExpansionItem {
    if (
        !isRecord(value)
        || typeof value.ordinal !== 'number'
        || typeof value.isRepresentative !== 'boolean'
    ) {
        throw new Error('Invalid item in library presentation expansion.');
    }
    return {
        asset: parseAsset(value.asset),
        ordinal: value.ordinal,
        isRepresentative: value.isRepresentative,
    };
}

function parseLibraryPresentationExpansion(value: unknown): LibraryPresentationExpansion {
    if (
        !isRecord(value)
        || typeof value.presentationKey !== 'string'
        || typeof value.representativeAssetId !== 'string'
        || typeof value.stackCount !== 'number'
        || typeof value.momentCount !== 'number'
        || !Array.isArray(value.items)
    ) {
        throw new Error('Invalid library presentation expansion response.');
    }
    return {
        presentationKey: value.presentationKey,
        relationshipKind: parseRelationshipKind(value.relationshipKind),
        representativeAssetId: value.representativeAssetId,
        stackCount: value.stackCount,
        momentCount: value.momentCount,
        items: value.items.map(parseExpansionItem),
    };
}

export function createLibraryPresentationActions(params: LibraryPresentationActionParams) {
    const { request, refreshLibrary } = params;

    return {
        getPresentationExpansion: (presentationKey: string): Promise<LibraryPresentationExpansion> => request({
            idPrefix: `get_presentation_expansion_${presentationKey}`,
            command: 'get_library_presentation_expansion',
            payload: { presentationKey },
            select: (data) => parseLibraryPresentationExpansion(data?.expansion),
        }),
        setPresentationCover: async (presentationKey: string, assetId: string): Promise<void> => {
            await request<void>({
                idPrefix: 'set_library_presentation_cover',
                command: 'set_library_presentation_cover',
                payload: { presentationKey, assetId },
                select: () => undefined,
            });
            refreshLibrary({ preservePagingState: true });
        },
        setPresentationShowSeparately: async (
            presentationKey: string,
            showSeparately = true,
        ): Promise<void> => {
            await request<void>({
                idPrefix: 'set_library_presentation_show_separately',
                command: 'set_library_presentation_show_separately',
                payload: { presentationKey, showSeparately },
                select: () => undefined,
            });
            refreshLibrary({ preservePagingState: true });
        },
    };
}
