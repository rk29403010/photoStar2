import type React from 'react';
import type { Asset } from '@contracts/core';
import { getNextZoomScale } from './zoomMath';
import { DEFAULT_INFO_PANEL_WIDTH, getTopBarStyle } from './singlePhotoOverlayLayout';
import { getAnalysisStatusContainerStyle } from './singlePhotoAnalysisStatus';

type TopBarProps = {
    readonly asset: Asset;
    readonly assetsLength: number;
    readonly currentIndex: number;
    readonly showActionMenu: boolean;
    readonly setShowActionMenu: (show: boolean) => void;
    readonly persistentAnalysisStatus: React.ReactNode;
    readonly actionMenu: React.ReactNode;
    readonly onClose: () => void;
    readonly controlsVisible: boolean;
    readonly showInfoPanel: boolean;
    readonly getOverlayVisibilityStyle: (controlsVisible: boolean) => React.CSSProperties;
}

type ZoomBarProps = {
    readonly scale: number;
    readonly setScale: (scale: number) => void;
    readonly setPan: (pan: { x: number; y: number }) => void;
    readonly resetPanZoom: () => void;
    readonly showFaces: boolean;
    readonly setShowFaces: (show: boolean) => void;
    readonly showInfoPanel: boolean;
    readonly setShowInfoPanel: (show: boolean) => void;
    readonly controlsVisible: boolean;
    readonly getOverlayVisibilityStyle: (controlsVisible: boolean) => React.CSSProperties;
}

const zoomButtonClass = "bg-transparent border-none text-white cursor-pointer text-base w-7 h-7 flex items-center justify-center hover:opacity-80 active:scale-95";
const dividerClass = "w-px h-4 bg-white/10";

export const TopBar: React.FC<TopBarProps> = ({
    asset: _asset,
    assetsLength,
    currentIndex,
    showActionMenu,
    setShowActionMenu,
    persistentAnalysisStatus,
    actionMenu,
    onClose,
    controlsVisible,
    showInfoPanel,
    getOverlayVisibilityStyle,
}) => (
    <>
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
            <div className="text-xs opacity-60 flex items-center">{currentIndex + 1} / {assetsLength}</div>
            <div className="flex gap-3 items-center">
                {actionMenu}
                <button onClick={onClose} className="bg-transparent border-none text-white text-2xl cursor-pointer opacity-70 leading-none p-1">✕</button>
            </div>
        </div>
        {persistentAnalysisStatus ? (
            <div
                style={getAnalysisStatusContainerStyle({
                    controlsVisible,
                    showInfoPanel,
                    infoPanelWidth: DEFAULT_INFO_PANEL_WIDTH,
                })}
                onClick={(event) => event.stopPropagation()}
            >
                {persistentAnalysisStatus}
            </div>
        ) : null}
    </>
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
            ...getOverlayVisibilityStyle(controlsVisible),
            zIndex: 1001,
        }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 bg-slate-900/85 px-4 py-2 rounded-full backdrop-blur-md border border-white/10 items-center"
        onClick={(event) => event.stopPropagation()}
    >
        <button onClick={() => { const nextScale = getNextZoomScale(scale, -1); setScale(nextScale); if (nextScale <= 1) {setPan({ x: 0, y: 0 });} }} className={zoomButtonClass} title="Zoom out">−</button>
        <div className="text-content-secondary text-xs min-w-[40px] text-center">{Math.round(scale * 100)}%</div>
        <button onClick={() => setScale(getNextZoomScale(scale, 1))} className={zoomButtonClass} title="Zoom in">+</button>
        <div className={dividerClass} />
        <button onClick={resetPanZoom} className="bg-transparent border-none text-white cursor-pointer text-xs flex items-center gap-1 hover:opacity-80 active:scale-95" title="Reset zoom"><span className="text-sm">⟲</span> Reset</button>
        <div className={dividerClass} />
        <button onClick={() => setShowFaces(!showFaces)} title={showFaces ? 'Hide faces' : 'Show faces'} className={`text-base cursor-pointer w-8 h-8 flex items-center justify-center rounded transition-all duration-200 active:scale-95 ${showFaces ? 'bg-cyan-500/25 border border-cyan-500/50 text-cyan-400' : 'bg-transparent border border-transparent text-white'}`}><span className="text-sm">👤</span></button>
        <div className={dividerClass} />
        <button onClick={() => setShowInfoPanel(!showInfoPanel)} title={showInfoPanel ? 'Hide info panel (I)' : 'Show info panel (I)'} className={`text-base cursor-pointer w-8 h-8 flex items-center justify-center rounded transition-all duration-200 active:scale-95 ${showInfoPanel ? 'bg-indigo-500/25 border border-indigo-500/50 text-indigo-300' : 'bg-transparent border border-transparent text-white'}`}><span className="text-sm">ℹ</span></button>
    </div>
);
