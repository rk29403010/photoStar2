import type { Asset } from '@contracts/core';

export type LibrarySortMode = 'filename' | 'date' | 'group';

export interface CurrentPhotoStatus {
    filename: string;
    sensitivity: string;
    dimensions: string | null;
}

function getFilename(asset: Pick<Asset, 'original_path'>): string {
    if (!asset.original_path) {return '';}
    return asset.original_path.replace(/\\/g, '/').split('/').pop() ?? asset.original_path;
}

function getTimestampRank(createdAt: string | null | undefined): number {
    if (!createdAt) {return Number.NEGATIVE_INFINITY;}
    const timestamp = Date.parse(createdAt);
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

export function sortAssetsForGallery(assets: Asset[], mode: LibrarySortMode): Asset[] {
    const sorted = [...assets];

    if (mode === 'group') {
        sorted.sort((left, right) => {
            const groupDelta = getGroupSortKey(left).localeCompare(getGroupSortKey(right), undefined, { numeric: true, sensitivity: 'base' });
            if (groupDelta !== 0) {
                return groupDelta;
            }

            return left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: 'base' });
        });
        return sorted;
    }

    if (mode === 'filename') {
        sorted.sort((left, right) => (
            getFilename(left).localeCompare(getFilename(right), undefined, { numeric: true, sensitivity: 'base' })
        ));
        return sorted;
    }

    sorted.sort((left, right) => getTimestampRank(right.created_at) - getTimestampRank(left.created_at));
    return sorted;
}

export function buildCurrentPhotoStatus(asset: Asset): CurrentPhotoStatus {
    return {
        filename: getFilename(asset),
        sensitivity: getSensitivityLabel(asset),
        dimensions: getDimensions(asset),
    };
}
