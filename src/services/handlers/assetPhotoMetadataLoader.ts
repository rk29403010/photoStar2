import type { PhotoMetadataBundle } from '../../boundary/contracts/core';
import { buildPhotoMetadataBundle } from '../photoMetadata/bundle';
import { createPhotoMetadataManualAssertionsService } from '../photoMetadata/manualAssertions';
import { createPhotoMetadataRepository } from '../photoMetadata/repository';
import type { CommandContext } from './types';

export function createPhotoMetadataBundleLoader(dbManager: CommandContext['dbManager']) {
    const repository = createPhotoMetadataRepository({ dbManager });
    const manualAssertionsService = createPhotoMetadataManualAssertionsService({ dbManager });
    const cache = new Map<string, PhotoMetadataBundle>();

    return (assetId: string) => {
        const cached = cache.get(assetId);
        if (cached) {return cached;}

        const bundle = buildPhotoMetadataBundle({
            repository,
            manualAssertionsService,
            assetId,
            includeEvidence: true,
        });
        cache.set(assetId, bundle);
        return bundle;
    };
}
