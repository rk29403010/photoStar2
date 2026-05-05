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
    const scrollContainerStyle: CSSProperties & Record<'--gallery-browse-row-height', string> = {
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        '--gallery-browse-row-height': `${browseRowHeight}px`,
    };

    return (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden', background: '#0a0a0a' }}>
            {timelineRail}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <LibraryToolbar {...toolbar} />
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    data-scroll-settled={isScrollSettled ? 'true' : 'false'}
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
