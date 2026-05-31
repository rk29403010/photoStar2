import type { Asset } from '@contracts/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { buildVisibleGalleryItems } from '@shared/utils/libraryGallerySelection';
import { createEmptyLibrarySelectionState, type LibrarySelectableItem, type LibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import type { RefObject } from 'react';
import { LayoutEngine } from '../layout/LayoutEngine';
import type { GalleryTimeSection, GalleryTimeSectionMode } from '../layout/galleryTimeSections';
import type { TimelineJumpRequest } from './libraryTimelineJump';

type LibraryGalleryPaneProps = {
    readonly layout: {
        items: LibrarySelectableItem[];
        onAssetClick?: (id: string) => void;
        selectedAssetId?: string | null;
        activeFilter?: LibraryFilter;
        showFaces?: boolean;
        onUntagAsset?: (assetId: string, personId: string) => void;
        librarySelection: LibrarySelectionState;
        onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
        declusteredAssets?: Set<string>;
        onHoverAssetChange?: (asset: Asset | null) => void;
        showGroupIds: boolean;
        hoveredGroupId: string | null;
        onHoveredGroupIdChange: (groupId: string | null) => void;
        layoutMode: GalleryLayoutMode;
        scrollContainerRef?: RefObject<HTMLDivElement | null>;
        showInfoPanel: boolean;
        isScrollSettled?: boolean;
        targetRowHeight?: number;
        onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
        onVisibleTimelineGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
        justifiedSections?: GalleryTimeSection[];
        timeSectionMode?: GalleryTimeSectionMode;
        timelineJumpRequest?: TimelineJumpRequest | null;
    };
    readonly rejected: {
        showRejected?: boolean;
        rejectedAssets?: Asset[];
        onAssetClick?: (id: string) => void;
        selectedAssetId?: string | null;
    };
}

const EMPTY_LIBRARY_SELECTION = createEmptyLibrarySelectionState();

function RejectedSection({ showRejected, rejectedAssets, onAssetClick, selectedAssetId }: LibraryGalleryPaneProps['rejected']) {
    if (!showRejected || !rejectedAssets || rejectedAssets.length === 0) {
        return null;
    }

    return (
        <div>
            <div className="flex items-center gap-3 px-6 py-3 border-t border-content/10 text-content-secondary text-xs font-semibold tracking-wider uppercase">
                <span className="text-red-500 opacity-70">🚫</span>
                <span>Rejected - {rejectedAssets.length} photo{rejectedAssets.length !== 1 ? 's' : ''} removed from this person</span>
                <div className="flex-1 h-px bg-content/10" />
            </div>
            <div className="opacity-45 grayscale">
                <LayoutEngine items={buildVisibleGalleryItems(rejectedAssets, { groupSimilarPhotos: false, sortMode: 'date' })} debug={false} onAssetClick={onAssetClick} selectedAssetId={selectedAssetId} activeFilter={undefined} showFaces={false} onUntagAsset={undefined} librarySelection={EMPTY_LIBRARY_SELECTION} onLibrarySelectionChange={undefined} declusteredAssets={undefined} showGroupIds={false} layoutMode="tiled" />
            </div>
        </div>
    );
}

export function LibraryGalleryPane(props: LibraryGalleryPaneProps) {
    return (
        <>
            <LayoutEngine {...props.layout} debug={false} />
            <RejectedSection {...props.rejected} />
        </>
    );
}
