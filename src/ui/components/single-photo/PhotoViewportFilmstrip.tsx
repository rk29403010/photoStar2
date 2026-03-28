import type { FC } from 'react';
import type { Asset, SimilarityOrbit } from '@contracts/core';
import { VariantFilmstrip } from './VariantFilmstrip';
import { shouldShowVariantFilmstrip } from './variantFilmstripModel';

export const VariantFilmstripOverlay: FC<{
    asset: Asset;
    onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    onOrbitLoaded: (assets: Asset[]) => void;
    onSelectAsset: (assetId: string) => void;
    onActiveGroupChange: (groupId: string) => void;
}> = ({ asset, onGetGroupOrbit, onOrbitLoaded, onSelectAsset, onActiveGroupChange }) => {
    if (!shouldShowVariantFilmstrip({ groupId: asset.group_id, hasOrbitLoader: Boolean(onGetGroupOrbit) })) {
        return null;
    }

    return (
        <VariantFilmstrip
            groupId={asset.group_id!}
            selectedAsset={asset}
            onGetGroupOrbit={onGetGroupOrbit!}
            onOrbitLoaded={onOrbitLoaded}
            onSelectAsset={onSelectAsset}
            onActiveGroupChange={onActiveGroupChange}
        />
    );
};
