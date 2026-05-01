export function getTopVisibleSelectionKeyFromScrollContainer(container: HTMLDivElement) {
    const containerBounds = container.getBoundingClientRect();
    const containerTop = containerBounds.top;
    const containerBottom = containerBounds.bottom;
    const visibleTiles = Array.from(container.querySelectorAll<HTMLElement>('[data-selection-key]'))
        .map((tile) => ({ tile, rect: tile.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > containerTop && rect.top < containerBottom)
        .sort((left, right) => (
            left.rect.top - right.rect.top
            || left.rect.left - right.rect.left
        ));
    let overlappingSelectionKey: string | null = null;

    for (const { tile, rect } of visibleTiles) {
        if (rect.top >= containerTop) {
            return tile.dataset.selectionKey ?? null;
        }

        if (overlappingSelectionKey == null) {
            overlappingSelectionKey = tile.dataset.selectionKey ?? null;
        }
    }

    return overlappingSelectionKey;
}

export function getTopVisibleTimeSectionIdFromScrollContainer(container: HTMLDivElement) {
    const containerBounds = container.getBoundingClientRect();
    const containerTop = containerBounds.top;
    const containerBottom = containerBounds.bottom;
    const visibleSections = Array.from(container.querySelectorAll<HTMLElement>('[data-time-section-id]'))
        .map((section) => ({ section, rect: section.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > containerTop && rect.top < containerBottom)
        .sort((left, right) => left.rect.top - right.rect.top);
    let overlappingSectionId: string | null = null;

    for (const { section, rect } of visibleSections) {
        const sectionId = section.dataset.timeSectionId ?? null;
        if (rect.top >= containerTop) {
            return sectionId;
        }

        if (overlappingSectionId == null) {
            overlappingSectionId = sectionId;
        }
    }

    return overlappingSectionId;
}
