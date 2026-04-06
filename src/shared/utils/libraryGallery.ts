import type { Asset } from '@contracts/core';

export type LibrarySortMode = 'filename' | 'date' | 'reverse-date' | 'group';

export interface CurrentPhotoStatus {
    filename: string;
    sensitivity: string;
    dimensions: string | null;
}

function getFilename(asset: Pick<Asset, 'original_path'>): string {
    if (!asset.original_path) {return '';}
    return asset.original_path.replace(/\\/g, '/').split('/').pop() ?? asset.original_path;
}

function getTimestampRank(timestampValue: string | null | undefined): number {
    if (!timestampValue) {return Number.NEGATIVE_INFINITY;}
    const timestamp = Date.parse(timestampValue);
    return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function getGroupSortKey(asset: Pick<Asset, 'group_id'>): string {
    return asset.group_id ?? '';
}

export function getEffectiveLibrarySortMode(mode: LibrarySortMode, groupSimilarPhotos: boolean): LibrarySortMode {
    if (groupSimilarPhotos && mode === 'group') {
        return 'filename';
    }

    return mode;
}

function getSensitivityLabel(asset: Pick<Asset, 'sensitivity_status' | 'sensitivity_score'>): string {
    if (asset.sensitivity_status === 'unsafe') {return 'Unsafe';}
    if (asset.sensitivity_status === 'review') {return 'Review';}
    if (asset.sensitivity_status === 'safe') {return 'Safe';}

    const score = asset.sensitivity_score;
    if (score == null) {return 'Unrated';}
    if (score >= 75) {return `Unsafe (${score}%)`;}
    if (score >= 25) {return `Review (${score}%)`;}
    return `Safe (${score}%)`;
}

function getDimensions(asset: Pick<Asset, 'width' | 'height'>): string | null {
    if (!asset.width || !asset.height) {return null;}
    return `${asset.width} × ${asset.height}`;
}

function compareAssetIds(left: Pick<Asset, 'id'>, right: Pick<Asset, 'id'>) {
    return left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: 'base' });
}

function compareAssetDates(left: Asset, right: Asset, direction: 'asc' | 'desc') {
    const leftRank = getTimestampRank(left.photo_created_at);
    const rightRank = getTimestampRank(right.photo_created_at);
    if (leftRank === rightRank) {
        return compareAssetIds(left, right);
    }
    if (leftRank === Number.NEGATIVE_INFINITY) {
        return 1;
    }
    if (rightRank === Number.NEGATIVE_INFINITY) {
        return -1;
    }
    return direction === 'asc' ? leftRank - rightRank : rightRank - leftRank;
}

function sortAssetsByGroup(sorted: Asset[]) {
    sorted.sort((left, right) => {
        const groupDelta = getGroupSortKey(left).localeCompare(getGroupSortKey(right), undefined, { numeric: true, sensitivity: 'base' });
        if (groupDelta !== 0) {
            return groupDelta;
        }

        return compareAssetIds(left, right);
    });
}

function sortAssetsByFilename(sorted: Asset[]) {
    sorted.sort((left, right) => (
        getFilename(left).localeCompare(getFilename(right), undefined, { numeric: true, sensitivity: 'base' })
    ));
}

function sortAssetsByDate(sorted: Asset[], direction: 'asc' | 'desc') {
    sorted.sort((left, right) => compareAssetDates(left, right, direction));
}

export function sortAssetsForGallery(assets: Asset[], mode: LibrarySortMode): Asset[] {
    const sorted = [...assets];

    if (mode === 'group') {
        sortAssetsByGroup(sorted);
        return sorted;
    }

    if (mode === 'filename') {
        sortAssetsByFilename(sorted);
        return sorted;
    }

    if (mode === 'reverse-date') {
        sortAssetsByDate(sorted, 'asc');
        return sorted;
    }

    sortAssetsByDate(sorted, 'desc');
    return sorted;
}

export function buildCurrentPhotoStatus(asset: Asset): CurrentPhotoStatus {
    return {
        filename: getFilename(asset),
        sensitivity: getSensitivityLabel(asset),
        dimensions: getDimensions(asset),
    };
}
