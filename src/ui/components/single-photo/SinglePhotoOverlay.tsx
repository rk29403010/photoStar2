import type { Dispatch, FC, SetStateAction } from 'react';
import type { Asset, ReviewItemSummary, SimilarityOrbit } from '@contracts/core';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import { InfoPanel } from './InfoPanel';
import { PhotoViewport } from './PhotoViewport';
import type { AnalysisState, PanelState } from './PhotoViewport';
import { DEFAULT_INFO_PANEL_WIDTH } from './singlePhotoOverlayLayout';

const APP_STATUS_BAR_HEIGHT = 30;

export interface SinglePhotoOverlayProps {
    asset: Asset;
    assets: Asset[];
    currentIndex: number;
    showControls: boolean;
    setShowControls: Dispatch<SetStateAction<boolean>>;
    showFaces: boolean;
    setShowFaces: Dispatch<SetStateAction<boolean>>;
    showActionMenu: boolean;
    setShowActionMenu: Dispatch<SetStateAction<boolean>>;
    hoveredFaceKey: string | null;
    setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    panelState: PanelState;
    onClose: () => void;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onExtractAiMetadata?: (assetId: string, imageStrategy?: 'overview_only' | 'overview_plus_tiles') => Promise<string | undefined>;
    onOpenSettings?: () => void;
    onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
    onOrbitLoaded: (assets: Asset[]) => void;
    onSelectAsset: (assetId: string) => void;
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
    onAssignAssetTag?: (assetId: string, tagLabel: string) => Promise<void>;
    onRemoveAssetTag?: (assetId: string, tagDefinitionId: string) => Promise<void>;
    onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
    onChangeIndex: (delta: -1 | 1) => void;
    onRevealControls: () => void;
    analysis: AnalysisState;
}

function PhotoInfoSidebar(props: {
    asset: Asset;
    panelState: PanelState;
    hoveredFaceKey: string | null;
    setHoveredFaceKey: Dispatch<SetStateAction<string | null>>;
    onAssignAssetTag?: (assetId: string, tagLabel: string) => Promise<void>;
    onRemoveAssetTag?: (assetId: string, tagDefinitionId: string) => Promise<void>;
    onSetReviewItemStatus?: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
    onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
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
    onExtractAiMetadata,
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
            onExtractAiMetadata={onExtractAiMetadata}
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
