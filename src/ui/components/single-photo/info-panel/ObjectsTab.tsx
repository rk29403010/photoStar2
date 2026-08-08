import type React from 'react';
import type { Asset } from '@contracts/core';
import { OverlaySection } from './PeopleTab';
import { buildSinglePhotoPeopleModel } from '../singlePhotoPeopleModel';

type ObjectsTabProps = {
  readonly asset: Asset;
  readonly hoveredFaceKey?: string | null;
  readonly onHoverFaceKey?: (key: string | null) => void;
  readonly selectedOverlayKey?: string | null;
  readonly onSelectOverlayKey?: (key: string | null) => void;
}

const EmptyObjectsState: React.FC = () => (
  <div className="text-center py-10 px-5 text-content-secondary/60">
    <div className="text-3xl mb-2.5">◇</div>
    <div className="text-xs font-bold uppercase text-content-secondary/80">No objects or regions yet</div>
    <div className="text-[11px] text-content-secondary/70 mt-1">Run image analysis to identify regions and segmented objects</div>
  </div>
);

export const ObjectsTab: React.FC<ObjectsTabProps> = ({ asset, hoveredFaceKey, onHoverFaceKey, selectedOverlayKey, onSelectOverlayKey }) => {
  const model = buildSinglePhotoPeopleModel(asset);
  if (model.regionsOfInterest.length === 0 && model.segmentedObjects.length === 0) {
    return <EmptyObjectsState />;
  }

  return (
    <div>
      <OverlaySection emoji="🧭" title="Regions of Interest" items={model.regionsOfInterest} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} selectedOverlayKey={selectedOverlayKey} onSelectOverlayKey={onSelectOverlayKey} asset={asset} trees={[]} links={[]} />
      <OverlaySection emoji="◇" title="Segmented Objects" items={model.segmentedObjects} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} selectedOverlayKey={selectedOverlayKey} onSelectOverlayKey={onSelectOverlayKey} asset={asset} trees={[]} links={[]} />
    </div>
  );
};
