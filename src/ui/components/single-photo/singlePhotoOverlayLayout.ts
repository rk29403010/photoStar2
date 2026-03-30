import type React from 'react';

export const CONTROLS_IDLE_MS = 10_000;
export const DEFAULT_INFO_PANEL_WIDTH = 360;
const TOP_BAR_COLLAPSED_RIGHT_PADDING = 20;
const TOP_BAR_INFO_PANEL_GAP = 32;

export function getTopBarRightClearance(params: {
    showInfoPanel: boolean;
    infoPanelWidth?: number;
}): number {
    const { showInfoPanel, infoPanelWidth = DEFAULT_INFO_PANEL_WIDTH } = params;
    return showInfoPanel ? infoPanelWidth + TOP_BAR_INFO_PANEL_GAP : TOP_BAR_COLLAPSED_RIGHT_PADDING;
}

export function getTopBarStyle(params: {
    controlsVisible: boolean;
    showInfoPanel: boolean;
    infoPanelWidth?: number;
    visibilityStyle: React.CSSProperties;
}): React.CSSProperties {
    const { controlsVisible: _controlsVisible, showInfoPanel, infoPanelWidth, visibilityStyle } = params;
    return {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: 16,
        paddingBottom: 16,
        paddingLeft: 20,
        paddingRight: getTopBarRightClearance({ showInfoPanel, infoPanelWidth }),
        display: 'flex',
        justifyContent: 'space-between',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)',
        color: 'white',
        zIndex: 1001,
        ...visibilityStyle,
    };
}

export function getLoadingBadgeStyle(): React.CSSProperties {
    return {
        position: 'absolute',
        left: 24,
        bottom: 28,
        padding: '8px 14px',
        borderRadius: 999,
        background: 'rgba(8, 12, 24, 0.82)',
        border: '1px solid rgba(148, 163, 184, 0.28)',
        color: '#e2e8f0',
        fontSize: 12,
        backdropFilter: 'blur(8px)',
        zIndex: 11,
    };
}
