import type React from 'react';
import type { Asset } from '@contracts/core';
import { getNextZoomScale } from './zoomMath';

export type AnalysisUiState = 'idle' | 'analyzing' | 'cancelling' | 'error';

interface ControlsOverlayProps {
    asset: Asset;
    assetsLength: number;
    currentIndex: number;
    showActionMenu: boolean;
    setShowActionMenu: (show: boolean) => void;
    showFaces: boolean;
    setShowFaces: (show: boolean) => void;
    scale: number;
    setScale: (s: number) => void;
    setPan: (pan: { x: number, y: number }) => void;
    resetPanZoom: () => void;
    onClose: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>;
    analysisState: AnalysisUiState;
    setAnalysisState: (state: AnalysisUiState) => void;
    setAnalysisError: (err: string | null) => void;
    analyzingAssetId: string | null;
    setAnalyzingAssetId: (id: string | null) => void;
    setAnalyzingJobId: (id: string | null) => void;
    showInfoPanel: boolean;
    setShowInfoPanel: (show: boolean) => void;
    controlsVisible: boolean;
}

interface ActionMenuProps {
    show: boolean;
    asset: Asset;
    analysisState: AnalysisUiState;
    setAnalysisState: (state: AnalysisUiState) => void;
    setAnalysisError: (err: string | null) => void;
    setAnalyzingAssetId: (id: string | null) => void;
    setAnalyzingJobId: (id: string | null) => void;
    onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    setShowActionMenu: (show: boolean) => void;
}

function menuHover() {
    return (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
    };
}

function menuOut(e: React.MouseEvent<HTMLButtonElement>) {
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

const zoomBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: 'white', cursor: 'pointer',
    fontSize: 16, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center'
};

const dividerStyle: React.CSSProperties = { width: 1, height: 18, background: 'rgba(255,255,255,0.12)' };

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

async function handleAnalyzeImage(event: React.MouseEvent<HTMLButtonElement>, props: ActionMenuProps) {
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
        const jobId = await onExtractAiMetadata(asset.id);
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

function MenuItem({
    color,
    active,
    label,
    icon,
    onClick,
}: {
    color: string;
    active: boolean;
    label: string;
    icon: string;
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
}) {
    return (
        <button onClick={onClick} style={menuItemStyle(color, active)} onMouseOver={menuHover()} onMouseOut={menuOut}>
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
        return <MenuItem color="#c084fc" active={false} icon="✨" label="Analyze Image" onClick={(event) => handleAnalyzeImage(event, props)} />;
    }

    if (props.analysisState === 'analyzing') {
        return <MenuItem color="#ef4444" active={false} icon="🚫" label="Cancel Analysis" onClick={(event) => handleCancelAnalysis(event, props)} />;
    }

    return null;
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

const AnalysisStatus: React.FC<{ analysisState: AnalysisUiState; analyzingAssetId: string | null; asset: Asset }> = ({ analysisState, analyzingAssetId, asset }) => {
    const isTargetAsset = analyzingAssetId === asset.id && !asset.ai_metadata;
    if (!isTargetAsset) {return null;}

    if (analysisState === 'analyzing') {
        return <div className="animate-pulse" style={{ color: '#c084fc', fontSize: '13px', background: 'rgba(192,132,252,0.1)', padding: '4px 10px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(192,132,252,0.3)' }}><span style={{ fontSize: '13px' }}>✨</span> Analyzing…</div>;
    }

    if (analysisState === 'cancelling') {
        return <div className="animate-pulse" style={{ color: '#f59e0b', fontSize: '13px', background: 'rgba(245,158,11,0.1)', padding: '4px 10px', borderRadius: '16px', border: '1px solid rgba(245,158,11,0.3)' }}>Cancelling…</div>;
    }

    return null;
};

const ActionMenu: React.FC<ActionMenuProps> = (props) => {
    if (!props.show) {return null;}

    return (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '6px', minWidth: '200px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <AiActionMenuItem {...props} />
            <SensitivityMenuItems asset={props.asset} onSetSensitivity={props.onSetSensitivity} setShowActionMenu={props.setShowActionMenu} />
        </div>
    );
};

const TopBar: React.FC<{
    asset: Asset;
    assetsLength: number;
    currentIndex: number;
    showActionMenu: boolean;
    setShowActionMenu: (show: boolean) => void;
    analysisState: AnalysisUiState;
    analyzingAssetId: string | null;
    onClose: () => void;
    setAnalysisState: (state: AnalysisUiState) => void;
    setAnalysisError: (err: string | null) => void;
    setAnalyzingAssetId: (id: string | null) => void;
    setAnalyzingJobId: (id: string | null) => void;
    onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    controlsVisible: boolean;
}> = ({ asset, assetsLength, currentIndex, showActionMenu, setShowActionMenu, analysisState, analyzingAssetId, onClose, setAnalysisState, setAnalysisError, setAnalyzingAssetId, setAnalyzingJobId, onExtractAiMetadata, onSetSensitivity, controlsVisible }) => (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)', color: 'white', zIndex: 1001, ...getOverlayVisibilityStyle(controlsVisible) }} onClick={(e) => { e.stopPropagation(); closeActionMenu(setShowActionMenu); }}>
        <div style={{ fontSize: '13px', opacity: 0.6, display: 'flex', alignItems: 'center' }}>{currentIndex + 1} / {assetsLength}</div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <AnalysisStatus analysisState={analysisState} analyzingAssetId={analyzingAssetId} asset={asset} />
            <div style={{ position: 'relative' }}>
                <button onClick={(e) => { e.stopPropagation(); setShowActionMenu(!showActionMenu); }} style={actionButtonStyle} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}>Actions ▾</button>
                <ActionMenu
                    show={showActionMenu}
                    asset={asset}
                    analysisState={analysisState}
                    setAnalysisState={setAnalysisState}
                    setAnalysisError={setAnalysisError}
                    setAnalyzingAssetId={setAnalyzingAssetId}
                    setAnalyzingJobId={setAnalyzingJobId}
                    onExtractAiMetadata={onExtractAiMetadata}
                    onSetSensitivity={onSetSensitivity}
                    setShowActionMenu={setShowActionMenu}
                />
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: '22px', cursor: 'pointer', opacity: 0.7, lineHeight: 1, padding: '2px 4px' }}>✕</button>
        </div>
    </div>
);

const NavButtons: React.FC<{ currentIndex: number; assetsLength: number; onPrevious: () => void; onNext: () => void; controlsVisible: boolean }> = ({ currentIndex, assetsLength, onPrevious, onNext, controlsVisible }) => (
    <>
        <div style={{ position: 'absolute', top: '50%', left: '12px', transform: 'translateY(-50%)', zIndex: 1001, opacity: controlsVisible ? (currentIndex > 0 ? 0.8 : 0.15) : 0, cursor: currentIndex > 0 ? 'pointer' : 'default', padding: '12px', pointerEvents: controlsVisible ? 'auto' : 'none', transition: 'opacity 0.35s ease' }} onClick={(e) => { e.stopPropagation(); onPrevious(); }}><div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18 }}>◀</div></div>
        <div style={{ position: 'absolute', top: '50%', right: '12px', transform: 'translateY(-50%)', zIndex: 1001, opacity: controlsVisible ? (currentIndex < assetsLength - 1 ? 0.8 : 0.15) : 0, cursor: currentIndex < assetsLength - 1 ? 'pointer' : 'default', padding: '12px', pointerEvents: controlsVisible ? 'auto' : 'none', transition: 'opacity 0.35s ease' }} onClick={(e) => { e.stopPropagation(); onNext(); }}><div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18 }}>▶</div></div>
    </>
);

const ZoomBar: React.FC<{ scale: number; setScale: (s: number) => void; setPan: (pan: { x: number; y: number }) => void; resetPanZoom: () => void; showFaces: boolean; setShowFaces: (show: boolean) => void; showInfoPanel: boolean; setShowInfoPanel: (show: boolean) => void; controlsVisible: boolean }> = ({ scale, setScale, setPan, resetPanZoom, showFaces, setShowFaces, showInfoPanel, setShowInfoPanel, controlsVisible }) => (
    <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px', background: 'rgba(15,15,25,0.85)', padding: '6px 14px', borderRadius: '30px', zIndex: 1001, backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)', alignItems: 'center', ...getOverlayVisibilityStyle(controlsVisible) }} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => { const nextScale = getNextZoomScale(scale, -1); setScale(nextScale); if (nextScale <= 1) {setPan({ x: 0, y: 0 });} }} style={zoomBtnStyle} title="Zoom out">−</button>
        <div style={{ color: '#94a3b8', fontSize: 12, minWidth: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</div>
        <button onClick={() => setScale(getNextZoomScale(scale, 1))} style={zoomBtnStyle} title="Zoom in">+</button>
        <div style={dividerStyle} />
        <button onClick={resetPanZoom} style={{ ...zoomBtnStyle, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }} title="Reset zoom"><span style={{ fontSize: 14 }}>⟲</span> Reset</button>
        <div style={dividerStyle} />
        <button onClick={() => setShowFaces(!showFaces)} title={showFaces ? 'Hide faces' : 'Show faces'} style={{ ...zoomBtnStyle, background: showFaces ? 'rgba(0,255,255,0.15)' : 'none', border: `1px solid ${showFaces ? 'rgba(0,255,255,0.5)' : 'transparent'}`, borderRadius: 6, color: showFaces ? 'cyan' : 'white', width: 30, height: 30, transition: 'all 0.2s' }}><span style={{ fontSize: 15 }}>👤</span></button>
        <div style={dividerStyle} />
        <button onClick={() => setShowInfoPanel(!showInfoPanel)} title={showInfoPanel ? 'Hide info panel (I)' : 'Show info panel (I)'} style={{ ...zoomBtnStyle, background: showInfoPanel ? 'rgba(99,102,241,0.25)' : 'none', border: `1px solid ${showInfoPanel ? 'rgba(99,102,241,0.6)' : 'transparent'}`, borderRadius: 6, color: showInfoPanel ? '#a5b4fc' : 'white', width: 30, height: 30, transition: 'all 0.2s' }}><span style={{ fontSize: 15 }}>ℹ</span></button>
    </div>
);

export const ControlsOverlay: React.FC<ControlsOverlayProps> = ({
    asset,
    assetsLength,
    currentIndex,
    showActionMenu,
    setShowActionMenu,
    showFaces,
    setShowFaces,
    scale,
    setScale,
    setPan,
    resetPanZoom,
    onClose,
    onPrevious,
    onNext,
    onSetSensitivity,
    onExtractAiMetadata,
    analysisState,
    setAnalysisState,
    setAnalysisError,
    analyzingAssetId,
    setAnalyzingAssetId,
    setAnalyzingJobId,
    showInfoPanel,
    setShowInfoPanel,
    controlsVisible
}) => (
    <>
        <TopBar
            asset={asset}
            assetsLength={assetsLength}
            currentIndex={currentIndex}
            showActionMenu={showActionMenu}
            setShowActionMenu={setShowActionMenu}
            analysisState={analysisState}
            analyzingAssetId={analyzingAssetId}
            onClose={onClose}
            setAnalysisState={setAnalysisState}
            setAnalysisError={setAnalysisError}
            setAnalyzingAssetId={setAnalyzingAssetId}
            setAnalyzingJobId={setAnalyzingJobId}
            onExtractAiMetadata={onExtractAiMetadata}
            onSetSensitivity={onSetSensitivity}
            controlsVisible={controlsVisible}
        />
        <NavButtons currentIndex={currentIndex} assetsLength={assetsLength} onPrevious={onPrevious} onNext={onNext} controlsVisible={controlsVisible} />
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
        />
    </>
);
