import { useCallback } from 'react';
import { clearLibrarySelection, getLibrarySelectionAssetIds, type LibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { Asset } from '@contracts/core';

type PhotoLibraryActions = {
    moveToBin: (assetIds: string[]) => Promise<void>;
    restoreFromBin: (assetIds: string[]) => Promise<void>;
    removeAssetsFromState: (assetIds: string[]) => void;
    restoreAssetsInState: (restoredAssets: Asset[], referenceAssets: Asset[]) => void;
    refreshLibrary: (options?: { preservePagingState?: boolean }) => void;
};

interface UsePhotoBinActionsParams {
    actions: PhotoLibraryActions;
    assets: Asset[];
    librarySelection: LibrarySelectionState;
    setLibrarySelection: (selection: LibrarySelectionState) => void;
    selectedAssetId: string | null;
    setSelectedAssetId: (assetId: string | null) => void;
    showTransientBanner: (params: { message: string; actionLabel?: string; onAction?: () => void }) => void;
}

function shouldClearFocusedAsset(selectedAssetId: string | null, assetIds: string[]) {
    return selectedAssetId !== null && assetIds.includes(selectedAssetId);
}

export function usePhotoBinActions(params: UsePhotoBinActionsParams) {
    const {
        actions,
        assets,
        librarySelection,
        setLibrarySelection,
        selectedAssetId,
        setSelectedAssetId,
        showTransientBanner,
    } = params;

    const restoreAssetIds = useCallback(async (
        assetIds: string[],
        restoredAssets: Asset[] = [],
        referenceAssets: Asset[] = assets,
    ) => {
        if (assetIds.length === 0) {
            return;
        }

        if (shouldClearFocusedAsset(selectedAssetId, assetIds)) {
            setSelectedAssetId(null);
        }

        await actions.restoreFromBin(assetIds);
        if (restoredAssets.length > 0) {
            actions.restoreAssetsInState(restoredAssets, referenceAssets);
        } else {
            actions.removeAssetsFromState(assetIds);
        }
        actions.refreshLibrary({ preservePagingState: true });
        showTransientBanner({ message: assetIds.length === 1 ? 'Photo restored from Bin.' : `${assetIds.length} photos restored from Bin.` });
    }, [actions, assets, selectedAssetId, setSelectedAssetId, showTransientBanner]);

    const moveAssetIdsToBin = useCallback(async (assetIds: string[]) => {
        if (assetIds.length === 0) {
            return;
        }

        const referenceAssets = assets;
        const movedAssets = assets.filter((asset) => assetIds.includes(asset.id));

        if (shouldClearFocusedAsset(selectedAssetId, assetIds)) {
            setSelectedAssetId(null);
        }

        setLibrarySelection(clearLibrarySelection());
        await actions.moveToBin(assetIds);
        actions.removeAssetsFromState(assetIds);
        actions.refreshLibrary({ preservePagingState: true });
        showTransientBanner({
            message: assetIds.length === 1 ? 'Photo moved to Bin.' : `${assetIds.length} photos moved to Bin.`,
            actionLabel: 'Undo',
            onAction: () => {
                void restoreAssetIds(assetIds, movedAssets, referenceAssets);
            },
        });
    }, [actions, assets, restoreAssetIds, selectedAssetId, setLibrarySelection, setSelectedAssetId, showTransientBanner]);

    const restoreSelectionFromBin = useCallback(async () => {
        await restoreAssetIds(getLibrarySelectionAssetIds(librarySelection, assets));
        setLibrarySelection(clearLibrarySelection());
    }, [assets, librarySelection, restoreAssetIds, setLibrarySelection]);

    return {
        handleMoveSelectionToBin: useCallback(async () => {
            await moveAssetIdsToBin(getLibrarySelectionAssetIds(librarySelection, assets));
        }, [assets, librarySelection, moveAssetIdsToBin]),
        handleRestoreSelectionFromBin: restoreSelectionFromBin,
        handleMoveAssetToBin: useCallback(async (assetId: string) => {
            await moveAssetIdsToBin([assetId]);
        }, [moveAssetIdsToBin]),
        handleRestoreAssetFromBin: useCallback(async (assetId: string) => {
            await restoreAssetIds([assetId]);
        }, [restoreAssetIds]),
    };
}
