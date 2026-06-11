import React, { useState } from 'react';
import type { Asset } from '@contracts/core';
import type { AiMetadataRequestOptions, AiMetadataImageStrategy, AiMetadataPass } from '@shared/aiMetadata/analysisOptions';
import { TopBar, ZoomBar } from './ActionOverlayChrome';
import { NavButtons } from './ActionOverlayNavButtons';
import { getAnalysisStatusBadgeStyle, isAnalysisStatusVisible } from './singlePhotoAnalysisStatus';
import { canExplodeGroup, canSelectAsStar, getExplodeGroupLabel, getLibraryBinActionLabel, getSelectAsStarLabel } from './singlePhotoActionMenuModel';

export type AnalysisUiState = 'idle' | 'analyzing' | 'cancelling' | 'error';

type ControlsOverlayProps = {
    readonly asset: Asset;
    readonly assetsLength: number;
    readonly currentIndex: number;
    readonly showActionMenu: boolean;
    readonly setShowActionMenu: (show: boolean) => void;
    readonly showFaces: boolean;
    readonly setShowFaces: (show: boolean) => void;
    readonly isImageTransitionPending: boolean;
    readonly scale: number;
    readonly setScale: (s: number) => void;
    readonly setPan: (pan: { x: number, y: number }) => void;
    readonly resetPanZoom: () => void;
    readonly onClose: () => void;
    readonly onPrevious: () => void;
    readonly onNext: () => void;
    readonly onSetSensitivity?: (assetId: string, status: string | null) => void;
    readonly onMoveToBin?: (assetId: string) => Promise<void>;
    readonly onRestoreFromBin?: (assetId: string) => Promise<void>;
    readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    readonly onExplodeGroup?: (groupId: string) => Promise<void>;
    readonly onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    readonly onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
    readonly analysisState: AnalysisUiState;
    readonly setAnalysisState: (state: AnalysisUiState) => void;
    readonly setAnalysisError: (err: string | null) => void;
    readonly analyzingAssetId: string | null;
    readonly setAnalyzingAssetId: (id: string | null) => void;
    readonly setAnalyzingJobId: (id: string | null) => void;
    readonly showInfoPanel: boolean;
    readonly setShowInfoPanel: (show: boolean) => void;
    readonly controlsVisible: boolean;
    readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[]) => void;
}

type ActionMenuProps = {
    readonly show: boolean;
    readonly asset: Asset;
    readonly analysisState: AnalysisUiState;
    readonly setAnalysisState: (state: AnalysisUiState) => void;
    readonly setAnalysisError: (err: string | null) => void;
    readonly setAnalyzingAssetId: (id: string | null) => void;
    readonly setAnalyzingJobId: (id: string | null) => void;
    readonly onExtractAiMetadata?: (assetId: string, options?: AiMetadataRequestOptions) => Promise<string | undefined>;
    readonly onRerunFaceDetection?: (assetId: string) => Promise<string | undefined>;
    readonly onSetSensitivity?: (assetId: string, status: string | null) => void;
    readonly onMoveToBin?: (assetId: string) => Promise<void>;
    readonly onRestoreFromBin?: (assetId: string) => Promise<void>;
    readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    readonly onExplodeGroup?: (groupId: string) => Promise<void>;
    readonly setShowActionMenu: (show: boolean) => void;
    readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[]) => void;
}

function menuHover() {
    return (e: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
    };
}

function menuOut(e: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>) {
    e.currentTarget.style.background = 'transparent';
}

function hexToRgb(hex: string): string {
    const map: Record<string, string> = {
        '#c084fc': '192,132,252',
        '#ef4444': '239,68,68',
        '#4ade80': '74,222,128',
        '#f59e0b': '245,158,11',
        '#6366f1': '99,102,241',
    };
    return map[hex] || '255,255,255';
}

const menuItemStyle = (color: string, active: boolean): React.CSSProperties => ({
    background: active ? `rgba(${hexToRgb(color)},0.12)` : 'transparent',
    border: 'none',
    color: active ? color : '#cbd5e1',
    textAlign: 'left',
    padding: '7px 12px',
    cursor: 'pointer',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 13,
    width: '100%',
    transition: 'background 0.15s'
});

const actionButtonStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'white',
    padding: '5px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    backdropFilter: 'blur(4px)',
    transition: 'background 0.2s'
};

function getOverlayVisibilityStyle(controlsVisible: boolean): React.CSSProperties {
    return {
        opacity: controlsVisible ? 1 : 0,
        pointerEvents: controlsVisible ? 'auto' : 'none',
        transition: 'opacity 0.35s ease'
    };
}

function closeActionMenu(setShowActionMenu: (show: boolean) => void) {
    setShowActionMenu(false);
}

function getNextSensitivityStatus(currentStatus: string | null | undefined, nextStatus: 'safe' | 'unsafe'): string | null {
    return currentStatus === nextStatus ? null : nextStatus;
}

async function handleAnalyzeImage(
    event: React.MouseEvent<HTMLButtonElement>,
    props: ActionMenuProps,
    options: AiMetadataRequestOptions,
) {
    const { asset, onExtractAiMetadata, setAnalysisError, setAnalysisState, setAnalyzingAssetId, setAnalyzingJobId, setShowActionMenu } = props;

    if (!onExtractAiMetadata) {
        return;
    }

    event.stopPropagation();
    setAnalysisState('analyzing');
    setAnalysisError(null);
    setAnalyzingAssetId(asset.id);
    closeActionMenu(setShowActionMenu);

    try {
        const jobId = await onExtractAiMetadata(asset.id, options);
        if (jobId) {
            setAnalyzingJobId(jobId);
        }
    } catch (error: unknown) {
        const err = error as Error;
        setAnalysisError(err.message);
        setAnalysisState('error');
        setAnalyzingJobId(null);
    }
}

function buildAnalysisOptions(imageStrategy: AiMetadataImageStrategy, metadataPass: AiMetadataPass): AiMetadataRequestOptions {
    return { imageStrategy, metadataPass };
}

async function handleRerunFaceDetection(
    event: React.MouseEvent<HTMLButtonElement>,
    props: ActionMenuProps,
) {
    if (!props.onRerunFaceDetection) {
        return;
    }

    event.stopPropagation();
    await props.onRerunFaceDetection(props.asset.id);
    closeActionMenu(props.setShowActionMenu);
}

function handleCancelAnalysis(event: React.MouseEvent<HTMLButtonElement>, props: ActionMenuProps) {
    event.stopPropagation();
    props.setAnalysisState('cancelling');
    closeActionMenu(props.setShowActionMenu);
    setTimeout(() => {
        props.setAnalysisState('idle');
        props.setAnalyzingAssetId(null);
    }, 1500);
}

function handleSensitivityClick(
    event: React.MouseEvent<HTMLButtonElement>,
    asset: Asset,
    nextStatus: 'safe' | 'unsafe',
    onSetSensitivity: (assetId: string, status: string | null) => void,
    setShowActionMenu: (show: boolean) => void
) {
    event.stopPropagation();
    onSetSensitivity(asset.id, getNextSensitivityStatus(asset.sensitivity_status, nextStatus));
    closeActionMenu(setShowActionMenu);
}

async function handleSelectAsStarClick(
    event: React.MouseEvent<HTMLButtonElement>,
    asset: Asset,
    onSetCanonical: (groupId: string, assetId: string) => Promise<void>,
    setShowActionMenu: (show: boolean) => void
) {
    event.stopPropagation();
    if (!asset.group_id) {
        return;
    }

    await onSetCanonical(asset.group_id, asset.id);
    closeActionMenu(setShowActionMenu);
}

async function handleExplodeGroupClick(
    event: React.MouseEvent<HTMLButtonElement>,
    asset: Asset,
    onExplodeGroup: (groupId: string) => Promise<void>,
    setShowActionMenu: (show: boolean) => void
) {
    event.stopPropagation();
    if (!asset.group_id) {
        return;
    }

    await onExplodeGroup(asset.group_id);
    closeActionMenu(setShowActionMenu);
}

function MenuItem({
    color,
    active,
    label,
    icon,
    onClick,
}: {
    readonly color: string;
    readonly active: boolean;
    readonly label: string;
    readonly icon: string;
    readonly onClick: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
}) {
    return (
        <button onClick={onClick} style={menuItemStyle(color, active)} onMouseOver={menuHover()} onMouseOut={menuOut} onFocus={menuHover()} onBlur={menuOut}>
            <span style={{ fontSize: 15 }}>{icon}</span>
            {label}
        </button>
    );
}

function AiActionMenuItem(props: ActionMenuProps) {
    if (!props.onExtractAiMetadata) {
        return null;
    }

    if (props.analysisState === 'idle') {
        return (
            <>
                <MenuItem
                    color="#c084fc"
                    active={false}
                    icon="✨"
                    label="Quick Analysis"
                    onClick={(event) => handleAnalyzeImage(event, props, buildAnalysisOptions('overview_only', 'scout'))}
                />
                <MenuItem
                    color="#6366f1"
                    active={false}
                    icon="🧩"
                    label="Detailed Analysis"
                    onClick={(event) => handleAnalyzeImage(event, props, buildAnalysisOptions('overview_plus_tiles', 'refine'))}
                />
            </>
        );
    }

    if (props.analysisState === 'analyzing') {
        return <MenuItem color="#ef4444" active={false} icon="🚫" label="Cancel Analysis" onClick={(event) => handleCancelAnalysis(event, props)} />;
    }

    return null;
}

function FaceDetectionMenuItem(props: ActionMenuProps) {
    if (!props.onRerunFaceDetection) {
        return null;
    }

    return (
        <>
            <hr style={{ borderColor: '#1f2937', margin: '4px 0' }} />
            <MenuItem color="#67e8f9" active={false} icon="🧠" label="Rerun Face Detection" onClick={(event) => handleRerunFaceDetection(event, props)} />
        </>
    );
}

function SensitivityMenuItems({ asset, onSetSensitivity, setShowActionMenu }: Pick<ActionMenuProps, 'asset' | 'onSetSensitivity' | 'setShowActionMenu'>) {
    if (!onSetSensitivity) {
        return null;
    }

    return (
        <>
            <hr style={{ borderColor: '#1f2937', margin: '4px 0' }} />
            <MenuItem
                color="#4ade80"
                active={asset.sensitivity_status === 'safe'}
                icon="😃"
                label="Mark as Safe"
                onClick={(event) => handleSensitivityClick(event, asset, 'safe', onSetSensitivity, setShowActionMenu)}
            />
            <MenuItem
                color="#ef4444"
                active={asset.sensitivity_status === 'unsafe'}
                icon="🫣"
                label="Mark as Unsafe"
                onClick={(event) => handleSensitivityClick(event, asset, 'unsafe', onSetSensitivity, setShowActionMenu)}
            />
        </>
    );
}

function BinMenuItem(props: Pick<ActionMenuProps, 'asset' | 'onMoveToBin' | 'onRestoreFromBin' | 'setShowActionMenu'>) {
    const { asset, onMoveToBin, onRestoreFromBin, setShowActionMenu } = props;
    const isBinned = Boolean(asset.binned_at);
    const handler = isBinned ? onRestoreFromBin : onMoveToBin;

    if (!handler) {
        return null;
    }

    return (
        <>
            <hr style={{ borderColor: '#1f2937', margin: '4px 0' }} />
            <MenuItem
                color={isBinned ? '#4ade80' : '#67e8f9'}
                active={false}
                icon={isBinned ? '↩' : '🗑'}
                label={getLibraryBinActionLabel(asset.binned_at ? 'restore' : 'move_to_bin')}
                onClick={async (event) => {
                    event.stopPropagation();
                    await handler(asset.id);
                    closeActionMenu(setShowActionMenu);
                }}
            />
        </>
    );
}

function GroupMenuItems(props: Pick<ActionMenuProps, 'asset' | 'onSetCanonical' | 'onExplodeGroup' | 'setShowActionMenu'>) {
    const { asset, onSetCanonical, onExplodeGroup, setShowActionMenu } = props;
    const showSelectAsStar = onSetCanonical && canSelectAsStar(asset);
    const showExplodeGroup = onExplodeGroup && canExplodeGroup(asset);

    if (!showSelectAsStar && !showExplodeGroup) {
        return null;
    }

    return (
        <>
            <hr style={{ borderColor: '#1f2937', margin: '4px 0' }} />
            {showSelectAsStar && (
                <MenuItem
                    color="#facc15"
                    active={false}
                    icon="⭐"
                    label={getSelectAsStarLabel()}
                    onClick={(event) => handleSelectAsStarClick(event, asset, onSetCanonical, setShowActionMenu)}
                />
            )}
            {showExplodeGroup && (
                <MenuItem
                    color="#ef4444"
                    active={false}
                    icon="💥"
                    label={getExplodeGroupLabel()}
                    onClick={(event) => handleExplodeGroupClick(event, asset, onExplodeGroup, setShowActionMenu)}
                />
            )}
        </>
    );
}

function renderAnalysisStatus({
    analysisState,
    analyzingAssetId,
    asset,
}: {
    analysisState: AnalysisUiState;
    analyzingAssetId: string | null;
    asset: Asset;
}): React.ReactNode {
    if (!isAnalysisStatusVisible({
        analyzingAssetId,
        assetId: asset.id,
    })) {
        return null;
    }

    if (analysisState === 'analyzing') {
        return <div className="motion-safe:animate-pulse" style={getAnalysisStatusBadgeStyle('analyzing')}><span style={{ fontSize: '13px' }}>✨</span> Analyzing…</div>;
    }

    if (analysisState === 'cancelling') {
        return <div className="motion-safe:animate-pulse" style={getAnalysisStatusBadgeStyle('cancelling')}>Cancelling…</div>;
    }

    return null;
}

function WorkflowSubMenu(props: {
    readonly onSelect: (workflowId: string) => void;
    readonly onCancel: () => void;
}) {
    return (
        <>
            <hr style={{ borderColor: '#1f2937', margin: '4px 0' }} />
            <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>SELECT WORKFLOW</span>
                <button
                    onClick={() => props.onSelect('library_previews_v1')}
                    style={menuItemStyle('#c084fc', false)}
                    onMouseOver={menuHover()}
                    onMouseOut={menuOut}
                    onFocus={menuHover()}
                    onBlur={menuOut}
                >
                    🖼️ Generate Previews
                </button>
                <button
                    onClick={() => props.onSelect('library_face_pipeline_v1')}
                    style={menuItemStyle('#67e8f9', false)}
                    onMouseOver={menuHover()}
                    onMouseOut={menuOut}
                    onFocus={menuHover()}
                    onBlur={menuOut}
                >
                    🎯 Run Face Workflow
                </button>
                <button
                    onClick={() => props.onSelect('library_ai_metadata_v1')}
                    style={menuItemStyle('#6366f1', false)}
                    onMouseOver={menuHover()}
                    onMouseOut={menuOut}
                    onFocus={menuHover()}
                    onBlur={menuOut}
                >
                    🧠 Run AI Metadata
                </button>
                <button
                    onClick={() => props.onSelect('library_sensitive_scan_v1')}
                    style={menuItemStyle('#ef4444', false)}
                    onMouseOver={menuHover()}
                    onMouseOut={menuOut}
                    onFocus={menuHover()}
                    onBlur={menuOut}
                >
                    🔞 Scan Sensitive Content
                </button>
                <button
                    onClick={() => props.onSelect('library_photo_date_v1')}
                    style={menuItemStyle('#facc15', false)}
                    onMouseOver={menuHover()}
                    onMouseOut={menuOut}
                    onFocus={menuHover()}
                    onBlur={menuOut}
                >
                    🗓️ Recalculate Photo Dates
                </button>
                <button
                    onClick={() => props.onSelect('library_detect_frames_v1')}
                    style={menuItemStyle('#f43f5e', false)}
                    onMouseOver={menuHover()}
                    onMouseOut={menuOut}
                    onFocus={menuHover()}
                    onBlur={menuOut}
                >
                    🖼️ Detect Frames
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        props.onCancel();
                    }}
                    style={{ ...menuItemStyle('#94a3b8', false), justifyContent: 'center', fontSize: '11px', border: '1px solid #1f2937', marginTop: '4px' }}
                >
                    Back
                </button>
            </div>
        </>
    );
}

function RunWorkflowMenuItems(props: ActionMenuProps) {
    const [showSelector, setShowSelector] = useState(false);

    if (!props.onRunWorkflowOnAssets) {
        return null;
    }

    if (!showSelector) {
        return (
            <>
                <hr style={{ borderColor: '#1f2937', margin: '4px 0' }} />
                <MenuItem
                    color="#38bdf8"
                    active={false}
                    icon="⚙️"
                    label="Run Workflow"
                    onClick={(event) => {
                        event.stopPropagation();
                        setShowSelector(true);
                    }}
                />
            </>
        );
    }

    const handleSelect = (workflowId: string) => {
        props.onRunWorkflowOnAssets?.(workflowId, [props.asset.id]);
        props.setShowActionMenu(false);
        setShowSelector(false);
    };

    return (
        <WorkflowSubMenu
            onSelect={handleSelect}
            onCancel={() => setShowSelector(false)}
        />
    );
}

const ActionMenu: React.FC<ActionMenuProps> = (props) => {
    if (!props.show) {return null;}

    return (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '6px', minWidth: '200px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <AiActionMenuItem {...props} />
            <FaceDetectionMenuItem {...props} />
            <GroupMenuItems asset={props.asset} onSetCanonical={props.onSetCanonical} onExplodeGroup={props.onExplodeGroup} setShowActionMenu={props.setShowActionMenu} />
            <BinMenuItem asset={props.asset} onMoveToBin={props.onMoveToBin} onRestoreFromBin={props.onRestoreFromBin} setShowActionMenu={props.setShowActionMenu} />
            <SensitivityMenuItems asset={props.asset} onSetSensitivity={props.onSetSensitivity} setShowActionMenu={props.setShowActionMenu} />
            <RunWorkflowMenuItems {...props} />
        </div>
    );
};

function renderActionMenuTrigger(props: ActionMenuProps) {
    const { show, setShowActionMenu } = props;

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={(event) => {
                    event.stopPropagation();
                    setShowActionMenu(!show);
                }}
                style={actionButtonStyle}
                onMouseOver={(event) => {
                    event.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                }}
                onMouseOut={(event) => {
                    event.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }}
                onFocus={(event) => {
                    event.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                }}
                onBlur={(event) => {
                    event.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }}
            >
                Actions ▾
            </button>
            <ActionMenu {...props} />
        </div>
    );
}

export const ControlsOverlay: React.FC<ControlsOverlayProps> = ({
    asset,
    assetsLength,
    currentIndex,
    showActionMenu,
    setShowActionMenu,
    showFaces,
    setShowFaces,
    isImageTransitionPending,
    scale,
    setScale,
    setPan,
    resetPanZoom,
    onClose,
    onPrevious,
    onNext,
    onSetSensitivity,
    onMoveToBin,
    onRestoreFromBin,
    onSetCanonical,
    onExplodeGroup,
    onExtractAiMetadata,
    onRerunFaceDetection,
    analysisState,
    setAnalysisState,
    setAnalysisError,
    analyzingAssetId,
    setAnalyzingAssetId,
    setAnalyzingJobId,
    showInfoPanel,
    setShowInfoPanel,
    controlsVisible,
    onRunWorkflowOnAssets
}) => {
    const persistentAnalysisStatus = renderAnalysisStatus({
        analysisState,
        analyzingAssetId,
        asset,
    });
    const actionMenuTrigger = renderActionMenuTrigger({
        show: showActionMenu,
        asset,
        analysisState,
        setAnalysisState,
        setAnalysisError,
        setAnalyzingAssetId,
        setAnalyzingJobId,
        onExtractAiMetadata,
        onRerunFaceDetection,
        onSetSensitivity,
        onMoveToBin,
        onRestoreFromBin,
        onSetCanonical,
        onExplodeGroup,
        setShowActionMenu,
        onRunWorkflowOnAssets,
    });

    return (
        <>
        <TopBar
            assetsLength={assetsLength}
            currentIndex={currentIndex}
            showActionMenu={showActionMenu}
            setShowActionMenu={setShowActionMenu}
            asset={asset}
            persistentAnalysisStatus={persistentAnalysisStatus}
            actionMenu={actionMenuTrigger}
            onClose={onClose}
            controlsVisible={controlsVisible}
            showInfoPanel={showInfoPanel}
            getOverlayVisibilityStyle={getOverlayVisibilityStyle}
        />
        <NavButtons currentIndex={currentIndex} assetsLength={assetsLength} onPrevious={onPrevious} onNext={onNext} controlsVisible={controlsVisible} showInfoPanel={showInfoPanel} isImageTransitionPending={isImageTransitionPending} />
        <ZoomBar
            scale={scale}
            setScale={setScale}
            setPan={setPan}
            resetPanZoom={resetPanZoom}
            showFaces={showFaces}
            setShowFaces={setShowFaces}
            showInfoPanel={showInfoPanel}
            setShowInfoPanel={setShowInfoPanel}
            controlsVisible={controlsVisible}
            getOverlayVisibilityStyle={getOverlayVisibilityStyle}
        />
        </>
    );
};
