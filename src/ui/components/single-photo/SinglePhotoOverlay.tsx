import type { Dispatch, FC, SetStateAction } from 'react';
import type { Asset, ReviewItemSummary, SimilarityOrbit } from '@contracts/core';
import type { AiMetadataRequestOptions } from '@shared/aiMetadata/analysisOptions';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import { InfoPanel } from './InfoPanel';
import { PhotoViewport } from './PhotoViewport';
import type { AnalysisState, PanelState } from './PhotoViewport';
import { DEFAULT_INFO_PANEL_WIDTH } from './singlePhotoOverlayLayout';

const APP_STATUS_BAR_HEIGHT = 30;

export type SinglePhotoOverlayProps = {
    readonly asset: Asset;
    readonly assets: Asset[];
    readonly currentIndex: number;
    readonly showControls: boolean;
    readonly setShowControls: Dispatch<SetStateAction<boolean>>;
    readonly showFaces: boolean;
    readonly setShowFaces: Dispatch<SetStateAction<boolean>>;
    readonly showActionMenu: boolean;
    readonly setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    readonly hoveredFaceKey: string | null;
    readonly setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    readonly panelState: PanelState;
    readonly onClose: () => void;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
    readonly onSetSensitivity?: (assetId: string, status: string | null) => void;
    readonly onMoveToBin?: (assetId: string) => Promise<void>;
    readonly onRestoreFromBin?: (assetId: string) => Promise<void>;
    readonly onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    readonly onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
    readonly onOpenSettings?: () => void;
    readonly onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    readonly onOrbitLoaded: (assets: Asset[]) => void;
    readonly onSelectAsset: (assetId: string) => void;
    readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    readonly onExplodeGroup?: (groupId: string) => Promise<void>;
    readonly onAssignAssetTag?: (assetId: string, tagLabel: string) => Promise<void>;
    readonly onRemoveAssetTag?: (assetId: string, tagDefinitionId: string) => Promise<void>;
    readonly onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    readonly onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
    readonly onChangeIndex: (delta: -1 | 1) => void;
    readonly onRevealControls: () => void;
    readonly analysis: AnalysisState;
}

function PhotoInfoSidebar(props: {
    readonly asset: Asset;
    readonly panelState: PanelState;
    readonly hoveredFaceKey: string | null;
    readonly setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    readonly onAssignAssetTag?: (assetId: string, tagLabel: string) => Promise<void>;
    readonly onRemoveAssetTag?: (assetId: string, tagDefinitionId: string) => Promise<void>;
    readonly onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    readonly onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
}) {
    const assignAssetTag = props.onAssignAssetTag;
    const removeAssetTag = props.onRemoveAssetTag;
    if (!props.panelState.showInfoPanel) {
        return null;
    }

    return (
        <div style={{ width: DEFAULT_INFO_PANEL_WIDTH, height: '100%', flexShrink: 0, zIndex: 1002, animation: 'slideInFromRight 0.22s ease-out' }}>
            <InfoPanel
                asset={props.asset}
                width={DEFAULT_INFO_PANEL_WIDTH}
                activeTab={props.panelState.activeInfoTab}
                onTabChange={props.panelState.setActiveInfoTab}
                onClose={() => props.panelState.setShowInfoPanel(false)}
                hoveredFaceKey={props.hoveredFaceKey}
                onHoverFaceKey={props.setHoveredFaceKey}
                onAssignTag={assignAssetTag ? (tagLabel) => assignAssetTag(props.asset.id, tagLabel) : undefined}
                onRemoveTag={removeAssetTag ? (tagDefinitionId) => removeAssetTag(props.asset.id, tagDefinitionId) : undefined}
                onSetReviewItemStatus={props.onSetReviewItemStatus}
                onFlagPhotoDateCorrection={props.onFlagPhotoDateCorrection}
            />
        </div>
    );
}

export const SinglePhotoOverlay: FC<SinglePhotoOverlayProps> = ({
    asset,
    assets,
    currentIndex,
    showControls,
    setShowControls,
    showFaces,
    setShowFaces,
    showActionMenu,
    setShowActionMenu,
    hoveredFaceKey,
    setHoveredFaceKey,
    panelState,
    onClose,
    onFaceClick,
    onIsolateFace,
    onSetSensitivity,
    onMoveToBin,
    onRestoreFromBin,
    onExtractAiMetadata,
    onRerunFaceDetection,
    onOpenSettings,
    onGetGroupOrbit,
    onOrbitLoaded,
    onSelectAsset,
    onSetCanonical,
    onExplodeGroup,
    onAssignAssetTag,
    onRemoveAssetTag,
    onSetReviewItemStatus,
    onFlagPhotoDateCorrection,
    onChangeIndex,
    onRevealControls,
    analysis
}) => (
    <div
        style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            bottom: APP_STATUS_BAR_HEIGHT,
            backgroundColor: '#050505',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'row',
            overflow: 'hidden',
            opacity: 0,
            animation: 'fadeInOverlay 0.2s ease-out forwards'
        }}
    >
        <PhotoViewport
            asset={asset}
            assetsLength={assets.length}
            currentIndex={currentIndex}
            showControls={showControls}
            setShowControls={setShowControls}
            showFaces={showFaces}
            setShowFaces={setShowFaces}
            showActionMenu={showActionMenu}
            setShowActionMenu={setShowActionMenu}
            hoveredFaceKey={hoveredFaceKey}
            setHoveredFaceKey={setHoveredFaceKey}
            panelState={panelState}
            onClose={onClose}
            onFaceClick={onFaceClick}
            onIsolateFace={onIsolateFace}
            onSetSensitivity={onSetSensitivity}
            onMoveToBin={onMoveToBin}
            onRestoreFromBin={onRestoreFromBin}
            onExtractAiMetadata={onExtractAiMetadata}
            onRerunFaceDetection={onRerunFaceDetection}
            onOpenSettings={onOpenSettings}
            onGetGroupOrbit={onGetGroupOrbit}
            onOrbitLoaded={onOrbitLoaded}
            onSelectAsset={onSelectAsset}
            onSetCanonical={onSetCanonical}
            onExplodeGroup={onExplodeGroup}
            onChangeIndex={onChangeIndex}
            onRevealControls={onRevealControls}
            analysis={analysis}
        />
        <PhotoInfoSidebar asset={asset} panelState={panelState} hoveredFaceKey={hoveredFaceKey} setHoveredFaceKey={setHoveredFaceKey} onAssignAssetTag={onAssignAssetTag} onRemoveAssetTag={onRemoveAssetTag} onSetReviewItemStatus={onSetReviewItemStatus} onFlagPhotoDateCorrection={onFlagPhotoDateCorrection} />
    </div>
);
