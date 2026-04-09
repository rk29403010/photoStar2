import type { Asset, GalleryTimelineSeek, ReviewItemSummary } from '@contracts/core';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import type { ComponentProps, CSSProperties, ReactNode, RefObject, UIEvent } from 'react';
import { GalleryInfoPanel } from './GalleryInfoPanel';
import { LibraryGalleryPane } from './LibraryGalleryPane';

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

function TimelineSeekOverlay({ seek }: { seek: GalleryTimelineSeek | null }) {
    return (
        <div
            style={{
                position: 'absolute',
                right: 18,
                bottom: 18,
                zIndex: 2,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 14,
                background: 'rgba(10,10,10,0.82)',
                border: '1px solid rgba(148,163,184,0.24)',
                color: '#e5e7eb',
                boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(8px)',
            }}
        >
            <div className="animate-pulse" style={{ width: 8, height: 8, borderRadius: 999, background: '#60a5fa' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Jumping to {getTimelineSeekLabel(seek)}...</span>
        </div>
    );
}

export interface LibraryPanelProps {
    scrollRef: RefObject<HTMLDivElement | null>;
    handleScroll: (event: UIEvent<HTMLDivElement>) => void;
    toolbar: ComponentProps<typeof LibraryGalleryPane>['toolbar'];
    timelineRail?: ReactNode;
    layout: ComponentProps<typeof LibraryGalleryPane>['layout'];
    rejected: ComponentProps<typeof LibraryGalleryPane>['rejected'];
    isSeekingTimeline: boolean;
    galleryTimelineSeek: GalleryTimelineSeek | null;
    showInfoPanel: boolean;
    activeInfoTab: InfoTab;
    onActiveInfoTabChange: (tab: InfoTab) => void;
    onShowInfoPanelChange: (show: boolean) => void;
    selectedInfoAsset: Asset | null;
    onAssignAssetTag?: (assetId: string, tagLabel: string) => Promise<void>;
    onRemoveAssetTag?: (assetId: string, tagDefinitionId: string) => Promise<void>;
    onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
    browseRowHeight: number;
    isScrollSettled: boolean;
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
    const scrollContainerStyle: CSSProperties = {
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflowY: 'auto',
        ['--gallery-browse-row-height' as const]: `${browseRowHeight}px`,
    };

    return (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden', background: '#0a0a0a' }}>
            {timelineRail}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                data-scroll-settled={isScrollSettled ? 'true' : 'false'}
                style={scrollContainerStyle}
            >
                <LibraryGalleryPane toolbar={toolbar} layout={layout} rejected={rejected} />
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
