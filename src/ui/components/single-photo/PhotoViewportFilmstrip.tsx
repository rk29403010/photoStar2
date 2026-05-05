import type { FC } from 'react';
import type { Asset, SimilarityOrbit } from '@contracts/core';
import { VariantFilmstrip } from './VariantFilmstrip';
import { shouldShowVariantFilmstrip } from './variantFilmstripModel';

export const VariantFilmstripOverlay: FC<{
    readonly asset: Asset;
    readonly onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    readonly onOrbitLoaded: (assets: Asset[]) => void;
    readonly onSelectAsset: (assetId: string) => void;
    readonly onActiveGroupChange: (groupId: string) => void;
}> = ({ asset, onGetGroupOrbit, onOrbitLoaded, onSelectAsset, onActiveGroupChange }) => {
    if (!shouldShowVariantFilmstrip({ groupId: asset.group_id, hasOrbitLoader: Boolean(onGetGroupOrbit) })) {
        return null;
    }

    return (
        <VariantFilmstrip
            key={`${asset.id}:${asset.group_id ?? 'ungrouped'}`}
            groupId={asset.group_id!}
            selectedAsset={asset}
            onGetGroupOrbit={onGetGroupOrbit!}
            onOrbitLoaded={onOrbitLoaded}
            onSelectAsset={onSelectAsset}
            onActiveGroupChange={onActiveGroupChange}
        />
    );
};
