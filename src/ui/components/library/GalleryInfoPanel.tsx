import type { Asset, ReviewItemSummary } from '@contracts/core';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import { InfoPanel } from '../single-photo/InfoPanel';
import { IconButton, Panel, Header } from '../Primitives';

type GalleryInfoPanelProps = {
    readonly asset: Asset | null;
    readonly activeTab: InfoTab;
    readonly onTabChange: (tab: InfoTab) => void;
    readonly onClose: () => void;
    readonly onAssignTag?: (tagLabel: string) => Promise<void>;
    readonly onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
    readonly onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    readonly onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
}

function EmptyGalleryInfoPanel({ onClose }: Pick<GalleryInfoPanelProps, 'onClose'>) {
    return (
        <Panel style={{ width: 360, minWidth: 360, maxWidth: 360 }} className="shrink-0 h-full">
            <Header>
                <div>
                    <div className="text-sm font-semibold text-content mb-0.5">Photo details</div>
                    <div className="text-xs text-content-secondary">Select a photo to inspect its metadata.</div>
                </div>
                <IconButton
                    onClick={onClose}
                    title="Hide info panel"
                    aria-label="Hide info panel"
                    className="w-7 h-7"
                >
                    ✕
                </IconButton>
            </Header>
            <div className="flex-1 flex items-center justify-center p-6 text-content-secondary text-center text-sm leading-relaxed">
                Multi-select stays intact here. The panel follows the latest selected photo.
            </div>
        </Panel>
    );
}

export function GalleryInfoPanel({
    asset,
    activeTab,
    onTabChange,
    onClose,
    onAssignTag,
    onRemoveTag,
    onSetReviewItemStatus,
    onFlagPhotoDateCorrection,
}: GalleryInfoPanelProps) {
    if (!asset) {
        return <EmptyGalleryInfoPanel onClose={onClose} />;
    }

    return (
        <InfoPanel
            asset={asset}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onClose={onClose}
            onAssignTag={onAssignTag}
            onRemoveTag={onRemoveTag}
            onSetReviewItemStatus={onSetReviewItemStatus}
            onFlagPhotoDateCorrection={onFlagPhotoDateCorrection}
        />
    );
}
