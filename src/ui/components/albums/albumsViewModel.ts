import type { Album } from '@contracts/core';

export function isSystemAlbum(album: Album): boolean {
    return Boolean(album.is_system);
}

export function isBinAlbum(album: Album): boolean {
    return isSystemAlbum(album) && album.system_kind === 'bin';
}

function getAlbumSortPriority(album: Album) {
    return isBinAlbum(album) ? -1 : 0;
}

export function sortAlbumsForDisplay(albums: Album[]): Album[] {
    return [...albums].sort((left, right) => {
        const binPriority = getAlbumSortPriority(left) - getAlbumSortPriority(right);
        if (binPriority !== 0) {
            return binPriority;
        }

        return left.title.localeCompare(right.title);
    });
}
