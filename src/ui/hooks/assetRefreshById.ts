import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Asset } from '@contracts/core';
import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import { mergeAssetDetail } from './assetDetailMerge';

export function useAssetRefreshById(params: {
    request: RequestFn;
    setAssets: Dispatch<SetStateAction<Asset[]>>;
}) {
    const { request, setAssets } = params;

    return useCallback((assetId: string) => {
        void request<Asset>({
            idPrefix: `refresh_asset_${assetId}`,
            command: 'get_asset_detail',
            payload: { assetId, includeEvidence: false },
            timeoutMs: 10000,
            select: (data) => (data?.asset as Asset) || { id: assetId, original_path: '' },
        }).then((asset) => {
            setAssets((previousAssets) => previousAssets.map((existingAsset) => (
                existingAsset.id === assetId ? mergeAssetDetail(existingAsset, asset) : existingAsset
            )));
        });
    }, [request, setAssets]);
}
