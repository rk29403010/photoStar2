import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';

function serializeFilter(filter: LibraryFilter) {
    return JSON.stringify(filter);
}

export function shouldRefreshLibraryForFilterStackChange(currentStack: LibraryFilter[], nextStack: LibraryFilter[]) {
    if (currentStack.length !== nextStack.length) {
        return true;
    }

    return currentStack.some((filter, index) => serializeFilter(filter) !== serializeFilter(nextStack[index]));
}
