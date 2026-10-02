import type { LibraryPresentationItem } from '@contracts/libraryPresentation';

export function findSinglePhotoPresentation(
    presentationItems: readonly LibraryPresentationItem[],
    assetId: string | null,
): LibraryPresentationItem | null {
    if (!assetId) {
        return null;
    }

    return presentationItems.find((item) => item.representativeAssetId === assetId)
        ?? presentationItems.find((item) => item.assetIds.includes(assetId))
        ?? null;
}
