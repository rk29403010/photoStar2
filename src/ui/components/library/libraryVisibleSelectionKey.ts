function getTopVisibleDataAttributeValueFromScrollContainer(
    container: HTMLDivElement,
    selector: string,
    datasetKey: 'selectionKey' | 'timeSectionId',
) {
    const containerBounds = container.getBoundingClientRect();
    const containerTop = containerBounds.top;
    const containerBottom = containerBounds.bottom;
    const visibleElements = Array.from(container.querySelectorAll<HTMLElement>(selector))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > containerTop && rect.top < containerBottom)
        .sort((left, right) => (
            left.rect.top - right.rect.top
            || left.rect.left - right.rect.left
        ));
    let overlappingValue: string | null = null;

    for (const { element, rect } of visibleElements) {
        if (rect.top >= containerTop) {
            return element.dataset[datasetKey] ?? null;
        }

        if (overlappingValue == null) {
            overlappingValue = element.dataset[datasetKey] ?? null;
        }
    }

    return overlappingValue;
}

function getTopVisibleTimelineGroupIdAtScrollAnchor(container: HTMLDivElement) {
    const containerBounds = container.getBoundingClientRect();
    const containerTop = containerBounds.top;
    const minimumVisibleBottom = containerTop + 12;
    const visibleSections = Array.from(container.querySelectorAll<HTMLElement>('[data-time-section-id]'))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > minimumVisibleBottom && rect.top < containerBounds.bottom)
        .sort((left, right) => (
            left.rect.top - right.rect.top
            || left.rect.left - right.rect.left
        ));
    return visibleSections[0]?.element.dataset.timeSectionId ?? null;
}

export function getTopVisibleSelectionKeyFromScrollContainer(container: HTMLDivElement) {
    return getTopVisibleDataAttributeValueFromScrollContainer(container, '[data-selection-key]', 'selectionKey');
}

export function getTopVisibleTimelineGroupIdFromScrollContainer(container: HTMLDivElement) {
    return getTopVisibleTimelineGroupIdAtScrollAnchor(container);
}
