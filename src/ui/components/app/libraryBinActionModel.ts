import type { LibraryFilter } from '@contracts/usePhotoLibrary.types';

const BIN_ALBUM_ID = 'system:bin';

export function isBinLibraryFilter(filter: LibraryFilter | undefined): boolean {
    return filter?.type === 'album' && filter.albumId === BIN_ALBUM_ID;
}

export function getLibraryBinActionLabel(action: 'move_to_bin' | 'restore'): string {
    return action === 'restore' ? 'Restore' : 'Move to Bin';
}
