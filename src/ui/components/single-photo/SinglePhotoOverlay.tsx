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
    readonly onGetAiCallsLog?: (assetId: string) => Promise<unknown[]>;
    readonly onGetAiCallLogDetail?: (logId: string) => Promise<unknown>;
    readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[]) => void;
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
    readonly onGetAiCallsLog?: (assetId: string) => Promise<unknown[]>;
    readonly onGetAiCallLogDetail?: (logId: string) => Promise<unknown>;
    readonly analysisState?: string;
}) {
    const assignAssetTag = props.onAssignAssetTag;
    const removeAssetTag = props.onRemoveAssetTag;
    if (!props.panelState.showInfoPanel) {
        return null;
    }

    return (
        <div 
            style={{ width: DEFAULT_INFO_PANEL_WIDTH, height: '100%', zIndex: 1002 }} 
            className="shrink-0 motion-safe:animate-slide-in-right"
        >
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
                onGetAiCallsLog={props.onGetAiCallsLog}
                onGetAiCallLogDetail={props.onGetAiCallLogDetail}
                analysisState={props.analysisState}
            />
        </div>
    );
}

export const SinglePhotoOverlay: FC<SinglePhotoOverlayProps> = (props) => (
    <div
        style={{ bottom: APP_STATUS_BAR_HEIGHT, zIndex: 1000 }}
        className="fixed top-0 left-0 w-screen bg-slate-950 flex flex-row overflow-hidden opacity-0 motion-safe:animate-fade-in-overlay"
    >
        <PhotoViewport
            asset={props.asset}
            assetsLength={props.assets.length}
            currentIndex={props.currentIndex}
            showControls={props.showControls}
            setShowControls={props.setShowControls}
            showFaces={props.showFaces}
            setShowFaces={props.setShowFaces}
            showActionMenu={props.showActionMenu}
            setShowActionMenu={props.setShowActionMenu}
            hoveredFaceKey={props.hoveredFaceKey}
            setHoveredFaceKey={props.setHoveredFaceKey}
            panelState={props.panelState}
            onClose={props.onClose}
            onFaceClick={props.onFaceClick}
            onIsolateFace={props.onIsolateFace}
            onSetSensitivity={props.onSetSensitivity}
            onMoveToBin={props.onMoveToBin}
            onRestoreFromBin={props.onRestoreFromBin}
            onExtractAiMetadata={props.onExtractAiMetadata}
            onRerunFaceDetection={props.onRerunFaceDetection}
            onOpenSettings={props.onOpenSettings}
            onGetGroupOrbit={props.onGetGroupOrbit}
            onOrbitLoaded={props.onOrbitLoaded}
            onSelectAsset={props.onSelectAsset}
            onSetCanonical={props.onSetCanonical}
            onExplodeGroup={props.onExplodeGroup}
            onChangeIndex={props.onChangeIndex}
            onRevealControls={props.onRevealControls}
            analysis={props.analysis}
            onRunWorkflowOnAssets={props.onRunWorkflowOnAssets}
        />
        <PhotoInfoSidebar
            asset={props.asset}
            panelState={props.panelState}
            hoveredFaceKey={props.hoveredFaceKey}
            setHoveredFaceKey={props.setHoveredFaceKey}
            onAssignAssetTag={props.onAssignAssetTag}
            onRemoveAssetTag={props.onRemoveAssetTag}
            onSetReviewItemStatus={props.onSetReviewItemStatus}
            onFlagPhotoDateCorrection={props.onFlagPhotoDateCorrection}
            onGetAiCallsLog={props.onGetAiCallsLog}
            onGetAiCallLogDetail={props.onGetAiCallLogDetail}
            analysisState={props.analysis.analysisState}
        />
    </div>
);
