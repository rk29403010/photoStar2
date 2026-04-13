export function getTopVisibleSelectionKeyFromScrollContainer(container: HTMLDivElement) {
    const containerBounds = container.getBoundingClientRect();
    const containerTop = containerBounds.top;
    const containerBottom = containerBounds.bottom;
    const visibleTiles = container.querySelectorAll<HTMLElement>('[data-selection-key]');
    let overlappingSelectionKey: string | null = null;

    for (const tile of visibleTiles) {
        const tileRect = tile.getBoundingClientRect();
        const intersectsViewport = tileRect.bottom > containerTop && tileRect.top < containerBottom;
        if (!intersectsViewport) {
            continue;
        }

        if (tileRect.top >= containerTop) {
            return tile.dataset.selectionKey ?? null;
        }

        if (overlappingSelectionKey == null) {
            overlappingSelectionKey = tile.dataset.selectionKey ?? null;
        }
    }

    return overlappingSelectionKey;
}
