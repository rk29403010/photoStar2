import type { Asset } from '@contracts/core';

type EvidenceTabId = 'file' | 'analysis' | 'people' | 'json';

export function shouldRequestPhotoMetadataEvidence(params: {
    activeTab: EvidenceTabId;
    asset: Asset;
}): boolean {
    return params.activeTab === 'json'
        && Boolean(params.asset.photo_metadata)
        && !params.asset.photo_metadata?.evidence;
}
