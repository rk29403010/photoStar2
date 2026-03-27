import type { DatabaseManager } from '../../data/db';
import { createPhotoMetadataRepository } from './repository';
import { resolvePhotoMetadataBundle, type ResolvedPhotoMetadata } from './resolution';
import type { PhotoMetadataBundle } from '../../boundary/contracts/core';

interface ResolvePhotoMetadataOptions {
    dbManager: DatabaseManager;
}

export class PhotoMetadataResolver {
    constructor(private readonly dbManager: DatabaseManager) {}

    resolvePhotoMetadata(assetId: string): PhotoMetadataBundle {
        const repository = createPhotoMetadataRepository({ dbManager: this.dbManager });
        const resolved = this.resolveAndPersist(repository, assetId);
        return resolved.bundle;
    }

    private resolveAndPersist(
        repository: ReturnType<typeof createPhotoMetadataRepository>,
        assetId: string,
    ): ResolvedPhotoMetadata {
        const blocks = repository.listBlocksForAsset(assetId);
        const assertions = repository.listAssertionsForAsset(assetId);
        const resolved = resolvePhotoMetadataBundle({ assetId, blocks, assertions });
        repository.saveResolvedProjection(resolved.projectionInput);
        return resolved;
    }
}

export function createPhotoMetadataResolver(options: ResolvePhotoMetadataOptions): PhotoMetadataResolver {
    return new PhotoMetadataResolver(options.dbManager);
}
