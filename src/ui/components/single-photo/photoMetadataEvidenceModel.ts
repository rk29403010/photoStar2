import type { Asset } from '@contracts/core';

type EvidenceTabId = 'profile' | 'tags' | 'people' | 'objects' | 'lineage' | 'group' | 'json';

export function shouldRequestPhotoMetadataEvidence(params: {
    activeTab: EvidenceTabId;
    asset: Asset;
}): boolean {
    return (params.activeTab === 'profile' || params.activeTab === 'tags' || params.activeTab === 'lineage' || params.activeTab === 'group' || params.activeTab === 'json')
        && Boolean(params.asset.photo_metadata)
        && !params.asset.photo_metadata?.evidence;
}
