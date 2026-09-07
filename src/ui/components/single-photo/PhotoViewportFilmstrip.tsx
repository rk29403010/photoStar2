import type { FC } from 'react';
import type { Asset, SimilarityOrbit } from '@contracts/core';
import type { LibraryPresentationExpansion, LibraryPresentationItem } from '@contracts/libraryPresentation';
import { PresentationFilmstrip } from './PresentationFilmstrip';
import { VariantFilmstrip } from './VariantFilmstrip';
import { shouldShowVariantFilmstrip } from './variantFilmstripModel';

type VariantFilmstripOverlayProps = {
    readonly asset: Asset;
    readonly presentation?: LibraryPresentationItem | null;
    readonly onGetPresentationExpansion?: (presentationKey: string) => Promise<LibraryPresentationExpansion>;
    readonly onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    readonly onOrbitLoaded: (assets: Asset[]) => void;
    readonly onSelectAsset: (assetId: string) => void;
    readonly onActiveGroupChange: (groupId: string) => void;
};

export const VariantFilmstripOverlay: FC<VariantFilmstripOverlayProps> = ({
    asset,
    presentation,
    onGetPresentationExpansion,
    onGetGroupOrbit,
    onOrbitLoaded,
    onSelectAsset,
    onActiveGroupChange,
}) => {
    if (presentation && presentation.stackCount > 1 && onGetPresentationExpansion) {
        return (
            <PresentationFilmstrip
                key={`${asset.id}:${presentation.presentationKey}`}
                presentationKey={presentation.presentationKey}
                selectedAsset={asset}
                onGetPresentationExpansion={onGetPresentationExpansion}
                onExpansionLoaded={onOrbitLoaded}
                onSelectAsset={onSelectAsset}
            />
        );
    }

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
