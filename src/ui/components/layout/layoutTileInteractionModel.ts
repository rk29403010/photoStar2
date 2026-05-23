export function getSingleClickTileAction(params: { showInfoPanel: boolean; selectionCount: number }) {
    if (params.showInfoPanel || params.selectionCount > 0) {
        return 'select' as const;
    }

    return 'open' as const;
}

export function shouldOpenAssetOnDoubleClick(showInfoPanel: boolean) {
    return showInfoPanel;
}
