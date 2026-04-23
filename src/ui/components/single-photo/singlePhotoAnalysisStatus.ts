import type React from 'react';

import { DEFAULT_INFO_PANEL_WIDTH, getTopBarRightClearance } from './singlePhotoOverlayLayout.ts';

type AnalysisStatusKind = 'analyzing' | 'cancelling';

export function isAnalysisStatusVisible(params: {
    analyzingAssetId: string | null;
    assetId: string;
}): boolean {
    return params.analyzingAssetId === params.assetId;
}

export function getAnalysisStatusBadgeStyle(kind: AnalysisStatusKind): React.CSSProperties {
    if (kind === 'cancelling') {
        return {
            color: '#fde68a',
            fontSize: '13px',
            background: '#3a2608',
            padding: '6px 12px',
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            border: '1px solid rgba(245,158,11,0.45)',
            boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
            backdropFilter: 'none',
        };
    }

    return {
        color: '#f3e8ff',
        fontSize: '13px',
        background: '#221433',
        padding: '6px 12px',
        borderRadius: '999px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        border: '1px solid rgba(192,132,252,0.5)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
        backdropFilter: 'none',
    };
}

export function getAnalysisStatusVisibilityStyle(_controlsVisible: boolean): React.CSSProperties {
    return {
        opacity: 1,
        pointerEvents: 'none',
        transition: 'opacity 0.35s ease',
    };
}

export function getAnalysisStatusContainerStyle(params: {
    controlsVisible: boolean;
    showInfoPanel: boolean;
    infoPanelWidth?: number;
}): React.CSSProperties {
    const { controlsVisible, showInfoPanel, infoPanelWidth = DEFAULT_INFO_PANEL_WIDTH } = params;
    return {
        position: 'absolute',
        top: 64,
        right: getTopBarRightClearance({ showInfoPanel, infoPanelWidth }),
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
        ...getAnalysisStatusVisibilityStyle(controlsVisible),
    };
}
