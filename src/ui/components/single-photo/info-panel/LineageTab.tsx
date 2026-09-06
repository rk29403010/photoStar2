import type React from 'react';
import type { ArchiveLineage } from '@contracts/archiveLineage';
import type { Asset, PhotoMetadataBundle } from '@contracts/core';
import { ArchiveRelationshipsSection } from './ArchiveRelationshipsSection';
import { LineageTab as MetadataLineageTab } from './MetadataLineageTab';

type EnrichedPhotoMetadataBundle = PhotoMetadataBundle & {
  archiveLineage?: ArchiveLineage;
};

function getArchiveLineage(asset: Asset): ArchiveLineage | null {
  const metadata = asset.photo_metadata as EnrichedPhotoMetadataBundle | null | undefined;
  return metadata?.archiveLineage ?? null;
}

export const LineageTab: React.FC<{ readonly asset: Asset }> = ({ asset }) => (
  <div className="flex flex-col gap-4">
    <ArchiveRelationshipsSection lineage={getArchiveLineage(asset)} />
    <MetadataLineageTab asset={asset} />
  </div>
);
