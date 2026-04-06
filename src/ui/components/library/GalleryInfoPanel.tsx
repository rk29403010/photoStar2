import type { Asset, ReviewItemSummary } from '@contracts/core';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import { InfoPanel } from '../single-photo/InfoPanel';

interface GalleryInfoPanelProps {
    asset: Asset | null;
    activeTab: InfoTab;
    onTabChange: (tab: InfoTab) => void;
    onClose: () => void;
    onAssignTag?: (tagLabel: string) => Promise<void>;
    onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
    onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
}

function EmptyGalleryInfoPanel({ onClose }: Pick<GalleryInfoPanelProps, 'onClose'>) {
    return (
        <div style={{ width: 360, minWidth: 360, maxWidth: 360, height: '100%', background: 'linear-gradient(180deg, #0f172a 0%, #0a0f1e 100%)', borderLeft: '1px solid #1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #1e293b', background: 'rgba(15,23,42,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>Photo details</div>
                    <div style={{ fontSize: 10, color: '#475569' }}>Select a photo to inspect its metadata.</div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    title="Hide info panel"
                    aria-label="Hide info panel"
                    style={{ background: 'transparent', border: '1px solid rgba(148,163,184,0.22)', color: '#cbd5e1', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
                >
                    ✕
                </button>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#94a3b8', textAlign: 'center', fontSize: 13, lineHeight: 1.6 }}>
                Multi-select stays intact here. The panel follows the latest selected photo.
            </div>
        </div>
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
