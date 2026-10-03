import type { ArchiveLineage } from '../../boundary/contracts/archiveLineage';
import type { PhotoMetadataBundle } from '../../boundary/contracts/core';
import { buildArchiveLineageForAsset } from '../relationships/archiveLineageProjection';
import { buildAnalysisDisplay } from '../photoAnalysis/display';
import type { CommandContext } from './types';

type EnrichedPhotoMetadataBundle = PhotoMetadataBundle & {
    archiveLineage: ArchiveLineage;
};

export function createPhotoMetadataBundleLoader(dbManager: CommandContext['dbManager']) {
    const cache = new Map<string, EnrichedPhotoMetadataBundle>();

    return (assetId: string) => {
        const cached = cache.get(assetId);
        if (cached) {return cached;}

        const metadataBundle = buildAnalysisDisplay(dbManager, assetId);
        const bundle: EnrichedPhotoMetadataBundle = {
            ...metadataBundle,
            archiveLineage: buildArchiveLineageForAsset(dbManager.getDb(), assetId),
        };
        cache.set(assetId, bundle);
        return bundle;
    };
}
