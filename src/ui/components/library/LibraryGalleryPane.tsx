import type { Asset } from '@contracts/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import type { LibrarySortMode } from '@shared/utils/libraryGallery';
import { buildVisibleGalleryItems } from '@shared/utils/libraryGallerySelection';
import { createEmptyLibrarySelectionState, type LibrarySelectableItem, type LibrarySelectionState } from '@shared/utils/librarySelectionState';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import type { RefObject } from 'react';
import { LayoutEngine } from '../layout/LayoutEngine';
import { LibraryToolbar } from './LibraryToolbar';
import type { GalleryTimeSectionMode } from '../layout/galleryTimeSections';
import type { TimelineJumpRequest } from './libraryTimelineJump';

interface LibraryGalleryPaneProps {
    toolbar: {
        sortMode: LibrarySortMode;
        onSortModeChange: (mode: LibrarySortMode) => void;
        layoutMode: GalleryLayoutMode;
        onLayoutModeChange: (mode: GalleryLayoutMode) => void;
        selectedTag: string;
        availableTags: string[];
        onTagChange: (tag: string) => void;
        groupSimilarPhotos: boolean;
        onGroupSimilarPhotosChange: (enabled: boolean) => void;
        showGroupIds: boolean;
        onShowGroupIdsChange: (enabled: boolean) => void;
        showInfoPanel: boolean;
        onShowInfoPanelChange: (show: boolean) => void;
    };
    layout: {
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
        timeSectionMode?: GalleryTimeSectionMode;
        timelineJumpRequest?: TimelineJumpRequest | null;
    };
    rejected: {
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderTop: '1px solid #1f1f1f', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                <span style={{ color: '#ef4444', opacity: 0.7 }}>🚫</span>
                <span>Rejected - {rejectedAssets.length} photo{rejectedAssets.length !== 1 ? 's' : ''} removed from this person</span>
                <div style={{ flex: 1, height: 1, background: '#1f1f1f' }} />
            </div>
            <div style={{ opacity: 0.45, filter: 'grayscale(40%)' }}>
                <LayoutEngine items={buildVisibleGalleryItems(rejectedAssets, { groupSimilarPhotos: false, sortMode: 'date' })} debug={false} onAssetClick={onAssetClick} selectedAssetId={selectedAssetId} activeFilter={undefined} showFaces={false} onUntagAsset={undefined} librarySelection={EMPTY_LIBRARY_SELECTION} onLibrarySelectionChange={undefined} declusteredAssets={undefined} showGroupIds={false} layoutMode="tiled" />
            </div>
        </div>
    );
}

export function LibraryGalleryPane(props: LibraryGalleryPaneProps) {
    return (
        <>
            <LibraryToolbar {...props.toolbar} />
            <LayoutEngine {...props.layout} debug={false} />
            <RejectedSection {...props.rejected} />
        </>
    );
}
