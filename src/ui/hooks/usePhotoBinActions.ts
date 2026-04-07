import { useCallback } from 'react';
import { clearLibrarySelection, getLibrarySelectionPhotoIds, type LibrarySelectionState } from '@shared/utils/librarySelectionState';
import { createStatusMessageBanner, type StatusBanner } from '@ui/components/app/statusBannerModel';

type PhotoLibraryActions = {
    moveToBin: (assetIds: string[]) => Promise<void>;
    restoreFromBin: (assetIds: string[]) => Promise<void>;
    refreshLibrary: (options?: { preservePagingState?: boolean }) => void;
};

interface UsePhotoBinActionsParams {
    actions: PhotoLibraryActions;
    librarySelection: LibrarySelectionState;
    setLibrarySelection: (selection: LibrarySelectionState) => void;
    selectedAssetId: string | null;
    setSelectedAssetId: (assetId: string | null) => void;
    setStatusBanner: (banner: StatusBanner | null) => void;
}

function shouldClearFocusedAsset(selectedAssetId: string | null, assetIds: string[]) {
    return selectedAssetId !== null && assetIds.includes(selectedAssetId);
}

export function usePhotoBinActions(params: UsePhotoBinActionsParams) {
    const {
        actions,
        librarySelection,
        setLibrarySelection,
        selectedAssetId,
        setSelectedAssetId,
        setStatusBanner,
    } = params;

    const restoreAssetIds = useCallback(async (assetIds: string[]) => {
        if (assetIds.length === 0) {
            return;
        }

        if (shouldClearFocusedAsset(selectedAssetId, assetIds)) {
            setSelectedAssetId(null);
        }

        await actions.restoreFromBin(assetIds);
        actions.refreshLibrary({ preservePagingState: true });
        setStatusBanner(createStatusMessageBanner(assetIds.length === 1 ? 'Photo restored from Bin.' : `${assetIds.length} photos restored from Bin.`));
    }, [actions, selectedAssetId, setSelectedAssetId, setStatusBanner]);

    const moveAssetIdsToBin = useCallback(async (assetIds: string[]) => {
        if (assetIds.length === 0) {
            return;
        }

        if (shouldClearFocusedAsset(selectedAssetId, assetIds)) {
            setSelectedAssetId(null);
        }

        setLibrarySelection(clearLibrarySelection());
        await actions.moveToBin(assetIds);
        actions.refreshLibrary({ preservePagingState: true });
        setStatusBanner({
            message: assetIds.length === 1 ? 'Photo moved to Bin.' : `${assetIds.length} photos moved to Bin.`,
            actionLabel: 'Undo',
            onAction: () => {
                void restoreAssetIds(assetIds);
            },
        });
    }, [actions, restoreAssetIds, selectedAssetId, setLibrarySelection, setSelectedAssetId, setStatusBanner]);

    const restoreSelectionFromBin = useCallback(async () => {
        await restoreAssetIds(getLibrarySelectionPhotoIds(librarySelection));
        setLibrarySelection(clearLibrarySelection());
    }, [librarySelection, restoreAssetIds, setLibrarySelection]);

    return {
        handleMoveSelectionToBin: useCallback(async () => {
            await moveAssetIdsToBin(getLibrarySelectionPhotoIds(librarySelection));
        }, [librarySelection, moveAssetIdsToBin]),
        handleRestoreSelectionFromBin: restoreSelectionFromBin,
        handleMoveAssetToBin: useCallback(async (assetId: string) => {
            await moveAssetIdsToBin([assetId]);
        }, [moveAssetIdsToBin]),
        handleRestoreAssetFromBin: useCallback(async (assetId: string) => {
            await restoreAssetIds([assetId]);
        }, [restoreAssetIds]),
    };
}
