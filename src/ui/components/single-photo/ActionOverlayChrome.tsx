import type React from 'react';
import type { Asset } from '@contracts/core';
import { getNextZoomScale } from './zoomMath';
import { DEFAULT_INFO_PANEL_WIDTH, getTopBarStyle } from './singlePhotoOverlayLayout';

interface TopBarProps {
    asset: Asset;
    assetsLength: number;
    currentIndex: number;
    showActionMenu: boolean;
    setShowActionMenu: (show: boolean) => void;
    analysisStatus: React.ReactNode;
    actionMenu: React.ReactNode;
    onClose: () => void;
    controlsVisible: boolean;
    showInfoPanel: boolean;
    getOverlayVisibilityStyle: (controlsVisible: boolean) => React.CSSProperties;
}

interface ZoomBarProps {
    scale: number;
    setScale: (scale: number) => void;
    setPan: (pan: { x: number; y: number }) => void;
    resetPanZoom: () => void;
    showFaces: boolean;
    setShowFaces: (show: boolean) => void;
    showInfoPanel: boolean;
    setShowInfoPanel: (show: boolean) => void;
    controlsVisible: boolean;
    getOverlayVisibilityStyle: (controlsVisible: boolean) => React.CSSProperties;
}

const zoomButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    fontSize: 16,
    width: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const dividerStyle: React.CSSProperties = {
    width: 1,
    height: 18,
    background: 'rgba(255,255,255,0.12)',
};

export const TopBar: React.FC<TopBarProps> = ({
    asset: _asset,
    assetsLength,
    currentIndex,
    showActionMenu,
    setShowActionMenu,
    analysisStatus,
    actionMenu,
    onClose,
    controlsVisible,
    showInfoPanel,
    getOverlayVisibilityStyle,
}) => (
    <div
        style={getTopBarStyle({
            controlsVisible,
            showInfoPanel,
            infoPanelWidth: DEFAULT_INFO_PANEL_WIDTH,
            visibilityStyle: getOverlayVisibilityStyle(controlsVisible),
        })}
        onClick={(event) => {
            event.stopPropagation();
            if (showActionMenu) {
                setShowActionMenu(false);
            }
        }}
    >
        <div style={{ fontSize: '13px', opacity: 0.6, display: 'flex', alignItems: 'center' }}>{currentIndex + 1} / {assetsLength}</div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {analysisStatus}
            {actionMenu}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: '22px', cursor: 'pointer', opacity: 0.7, lineHeight: 1, padding: '2px 4px' }}>✕</button>
        </div>
    </div>
);

export const ZoomBar: React.FC<ZoomBarProps> = ({
    scale,
    setScale,
    setPan,
    resetPanZoom,
    showFaces,
    setShowFaces,
    showInfoPanel,
    setShowInfoPanel,
    controlsVisible,
    getOverlayVisibilityStyle,
}) => (
    <div
        style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '8px',
            background: 'rgba(15,15,25,0.85)',
            padding: '6px 14px',
            borderRadius: '30px',
            zIndex: 1001,
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
            alignItems: 'center',
            ...getOverlayVisibilityStyle(controlsVisible),
        }}
        onClick={(event) => event.stopPropagation()}
    >
        <button onClick={() => { const nextScale = getNextZoomScale(scale, -1); setScale(nextScale); if (nextScale <= 1) {setPan({ x: 0, y: 0 });} }} style={zoomButtonStyle} title="Zoom out">−</button>
        <div style={{ color: '#94a3b8', fontSize: 12, minWidth: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</div>
        <button onClick={() => setScale(getNextZoomScale(scale, 1))} style={zoomButtonStyle} title="Zoom in">+</button>
        <div style={dividerStyle} />
        <button onClick={resetPanZoom} style={{ ...zoomButtonStyle, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }} title="Reset zoom"><span style={{ fontSize: 14 }}>⟲</span> Reset</button>
        <div style={dividerStyle} />
        <button onClick={() => setShowFaces(!showFaces)} title={showFaces ? 'Hide faces' : 'Show faces'} style={{ ...zoomButtonStyle, background: showFaces ? 'rgba(0,255,255,0.15)' : 'none', border: `1px solid ${showFaces ? 'rgba(0,255,255,0.5)' : 'transparent'}`, borderRadius: 6, color: showFaces ? 'cyan' : 'white', width: 30, height: 30, transition: 'all 0.2s' }}><span style={{ fontSize: 15 }}>👤</span></button>
        <div style={dividerStyle} />
        <button onClick={() => setShowInfoPanel(!showInfoPanel)} title={showInfoPanel ? 'Hide info panel (I)' : 'Show info panel (I)'} style={{ ...zoomButtonStyle, background: showInfoPanel ? 'rgba(99,102,241,0.25)' : 'none', border: `1px solid ${showInfoPanel ? 'rgba(99,102,241,0.6)' : 'transparent'}`, borderRadius: 6, color: showInfoPanel ? '#a5b4fc' : 'white', width: 30, height: 30, transition: 'all 0.2s' }}><span style={{ fontSize: 15 }}>ℹ</span></button>
    </div>
);
