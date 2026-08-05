import { useEffect, useRef } from 'react';
import type { Asset } from '@contracts/core';
import { shouldRequestPhotoMetadataEvidence } from './photoMetadataEvidenceModel';

type InfoTab = 'profile' | 'people' | 'objects' | 'lineage' | 'group' | 'json' | 'ailogs';

export function usePhotoMetadataEvidenceLoader(params: {
    activeTab: InfoTab;
    asset: Asset | undefined;
    loadAssetEvidence?: (assetId: string) => Promise<void>;
}) {
    const requestedAssetIdRef = useRef<string | null>(null);
    const { activeTab, asset, loadAssetEvidence } = params;

    useEffect(() => {
        if (!asset?.id || !loadAssetEvidence) {
            return;
        }

        if (activeTab === 'ailogs' || !shouldRequestPhotoMetadataEvidence({ activeTab, asset })) {
            if (asset.photo_metadata?.evidence) {
                requestedAssetIdRef.current = null;
            }
            return;
        }

        if (requestedAssetIdRef.current === asset.id) {
            return;
        }

        requestedAssetIdRef.current = asset.id;
        void loadAssetEvidence(asset.id);
    }, [activeTab, asset, loadAssetEvidence]);
}
