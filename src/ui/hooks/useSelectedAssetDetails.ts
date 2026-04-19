import { useEffect, useRef } from 'react';
import type { usePhotoLibrary } from './usePhotoLibrary';

export function useSelectedAssetDetails(
    loadAssetDetails: ReturnType<typeof usePhotoLibrary>['actions']['loadAssetDetails'],
    selectedAssetId: string | null,
) {
    const requestedAssetIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!selectedAssetId) {
            requestedAssetIdRef.current = null;
            return;
        }

        if (requestedAssetIdRef.current === selectedAssetId) {
            return;
        }

        requestedAssetIdRef.current = selectedAssetId;
        void loadAssetDetails(selectedAssetId);
    }, [loadAssetDetails, selectedAssetId]);
}
