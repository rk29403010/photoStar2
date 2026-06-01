import type { Asset, GalleryTimelineSeek, ReviewItemSummary } from '@contracts/core';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import type { ComponentProps, CSSProperties, ReactNode, RefObject, UIEvent } from 'react';
import { GalleryInfoPanel } from './GalleryInfoPanel';
import { LibraryGalleryPane } from './LibraryGalleryPane';
import { LibraryToolbar } from './LibraryToolbar';

function getTimelineSeekLabel(seek: GalleryTimelineSeek | null) {
    if (seek?.kind === 'unknown') {
        return 'Unknown date';
    }
    if (seek?.kind === 'dated') {
        const year = new Date(seek.targetDate).getUTCFullYear();
        return Number.isNaN(year) ? 'timeline' : `${year}s`;
    }
    return 'timeline';
}

function TimelineSeekOverlay({ seek }: { readonly seek: GalleryTimelineSeek | null }) {
    return (
        <div className="absolute right-4 bottom-4 z-10 pointer-events-none flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-black/80 border border-content/10 text-content shadow-lg backdrop-blur-md">
            <div className="animate-pulse w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-xs font-semibold">Jumping to {getTimelineSeekLabel(seek)}...</span>
        </div>
    );
}

export type LibraryPanelProps = {
    readonly scrollRef: RefObject<HTMLDivElement | null>;
    readonly handleScroll: (event: UIEvent<HTMLDivElement>) => void;
    readonly toolbar: ComponentProps<typeof LibraryToolbar>;
    readonly timelineRail?: ReactNode;
    readonly layout: ComponentProps<typeof LibraryGalleryPane>['layout'];
    readonly rejected: ComponentProps<typeof LibraryGalleryPane>['rejected'];
    readonly isSeekingTimeline: boolean;
    readonly galleryTimelineSeek: GalleryTimelineSeek | null;
    readonly showInfoPanel: boolean;
    readonly activeInfoTab: InfoTab;
    readonly onActiveInfoTabChange: (tab: InfoTab) => void;
    readonly onShowInfoPanelChange: (show: boolean) => void;
    readonly selectedInfoAsset: Asset | null;
    readonly onAssignAssetTag?: (assetId: string, tagLabel: string) => Promise<void>;
    readonly onRemoveAssetTag?: (assetId: string, tagDefinitionId: string) => Promise<void>;
    readonly onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    readonly onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
    readonly browseRowHeight: number;
    readonly isScrollSettled: boolean;
}

export function LibraryPanel({
    scrollRef,
    handleScroll,
    toolbar,
    timelineRail,
    layout,
    rejected,
    isSeekingTimeline,
    galleryTimelineSeek,
    showInfoPanel,
    activeInfoTab,
    onActiveInfoTabChange,
    onShowInfoPanelChange,
    selectedInfoAsset,
    onAssignAssetTag,
    onRemoveAssetTag,
    onSetReviewItemStatus,
    onFlagPhotoDateCorrection,
    browseRowHeight,
    isScrollSettled,
}: LibraryPanelProps) {
    const scrollContainerStyle = {
        '--gallery-browse-row-height': `${browseRowHeight}px`,
    } as CSSProperties;

    return (
        <div className="relative flex-1 min-h-0 min-w-0 flex overflow-hidden bg-surface">
            {timelineRail}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                <LibraryToolbar {...toolbar} />
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    data-scroll-settled={isScrollSettled ? 'true' : 'false'}
                    className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-3 bg-surface"
                    style={scrollContainerStyle}
                >
                    <LibraryGalleryPane layout={layout} rejected={rejected} />
                </div>
            </div>
            {isSeekingTimeline && layout.items.length > 0 && <TimelineSeekOverlay seek={galleryTimelineSeek} />}
            {showInfoPanel && (
                <GalleryInfoPanel
                    asset={selectedInfoAsset}
                    activeTab={activeInfoTab}
                    onTabChange={onActiveInfoTabChange}
                    onClose={() => onShowInfoPanelChange(false)}
                    onAssignTag={selectedInfoAsset && onAssignAssetTag ? (tagLabel) => onAssignAssetTag(selectedInfoAsset.id, tagLabel) : undefined}
                    onRemoveTag={selectedInfoAsset && onRemoveAssetTag ? (tagDefinitionId) => onRemoveAssetTag(selectedInfoAsset.id, tagDefinitionId) : undefined}
                    onSetReviewItemStatus={onSetReviewItemStatus}
                    onFlagPhotoDateCorrection={onFlagPhotoDateCorrection}
                />
            )}
        </div>
    );
}
