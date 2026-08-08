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
    readonly showInfoPanel: boolean;
    readonly setShowInfoPanel: (show: boolean) => void;
    readonly controlsVisible: boolean;
    readonly getOverlayVisibilityStyle: (controlsVisible: boolean) => React.CSSProperties;
    readonly hasFrame: boolean;
    readonly showWithFrame: boolean;
    readonly setShowWithFrame: (show: boolean) => void;
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
}) => {
    return (
        <>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events, deslint/prefer-semantic-html -- container click stops propagation to prevent toggling visibility */}
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
                /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events, deslint/prefer-semantic-html -- container click stops propagation to prevent toggling visibility */
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
};

export const ZoomBar: React.FC<ZoomBarProps> = ({
    scale,
    setScale,
    setPan,
    resetPanZoom,
    showInfoPanel,
    setShowInfoPanel,
    controlsVisible,
    getOverlayVisibilityStyle,
    hasFrame,
    showWithFrame,
    setShowWithFrame,
}) => {
    /* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events, deslint/prefer-semantic-html */
    let frameButtonTitle = 'No frame detected';
    if (hasFrame) {
        frameButtonTitle = showWithFrame ? 'Hide frame' : 'Show frame';
    }

    let frameButtonStateClass = 'bg-transparent border border-transparent text-white';
    if (!hasFrame) {
        frameButtonStateClass = 'opacity-40 cursor-not-allowed text-slate-500';
    } else if (showWithFrame) {
        frameButtonStateClass = 'bg-amber-500/25 border border-amber-500/50 text-amber-300';
    }

    return (
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
            <button onClick={() => setShowWithFrame(!showWithFrame)} disabled={!hasFrame} title={frameButtonTitle} aria-label={frameButtonTitle} className={`text-base cursor-pointer w-8 h-8 flex items-center justify-center rounded motion-safe:transition-all motion-safe:duration-200 active:scale-95 ${frameButtonStateClass}`}><span className="text-sm" aria-hidden="true">🖼️</span></button>
            <div className={dividerClass} />
            <button onClick={() => setShowInfoPanel(!showInfoPanel)} title={showInfoPanel ? 'Hide info panel (I)' : 'Show info panel (I)'} aria-label={showInfoPanel ? 'Hide info panel' : 'Show info panel'} className={`text-base cursor-pointer w-8 h-8 flex items-center justify-center rounded motion-safe:transition-all motion-safe:duration-200 active:scale-95 ${showInfoPanel ? 'bg-indigo-500/25 border border-indigo-500/50 text-indigo-300' : 'bg-transparent border border-transparent text-white'}`}><span className="text-sm" aria-hidden="true">ℹ</span></button>
        </div>
    );
    /* eslint-enable jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events, deslint/prefer-semantic-html */
};
