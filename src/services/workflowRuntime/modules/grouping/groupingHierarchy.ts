type GroupableAsset = {
    id: string;
    originalPath: string;
    fileSize: number;
    width: number;
    height: number;
    exifDatetime?: string | null;
    createdAt?: string | null;
};

const EXTENSION_QUALITY_RANK: Record<string, number> = {
    '.avif': 5,
    '.heic': 4,
    '.heif': 4,
    '.png': 3,
    '.tif': 3,
    '.tiff': 3,
    '.webp': 2,
    '.jpg': 1,
    '.jpeg': 1,
};

function getPathExtension(filePath: string): string {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    const lastDotIndex = normalizedPath.lastIndexOf('.');
    return lastDotIndex >= 0 ? normalizedPath.slice(lastDotIndex) : '';
}

function getPixelArea(asset: Pick<GroupableAsset, 'width' | 'height'>): number {
    return Math.max(asset.width, 0) * Math.max(asset.height, 0);
}

function getBytesPerPixel(asset: Pick<GroupableAsset, 'fileSize' | 'width' | 'height'>): number {
    const pixelArea = getPixelArea(asset);
    if (pixelArea <= 0) {
        return 0;
    }
    return asset.fileSize / pixelArea;
}

function getExtensionRank(asset: Pick<GroupableAsset, 'originalPath'>): number {
    return EXTENSION_QUALITY_RANK[getPathExtension(asset.originalPath)] ?? 0;
}

function compareByQuality(left: GroupableAsset, right: GroupableAsset): number {
    const pixelAreaDelta = getPixelArea(right) - getPixelArea(left);
    if (pixelAreaDelta !== 0) {
        return pixelAreaDelta;
    }

    const extensionDelta = getExtensionRank(right) - getExtensionRank(left);
    if (extensionDelta !== 0) {
        return extensionDelta;
    }

    const bytesPerPixelDelta = getBytesPerPixel(right) - getBytesPerPixel(left);
    if (bytesPerPixelDelta !== 0) {
        return bytesPerPixelDelta;
    }

    const fileSizeDelta = right.fileSize - left.fileSize;
    if (fileSizeDelta !== 0) {
        return fileSizeDelta;
    }

    return left.id.localeCompare(right.id);
}

function getTimestampValue(timestamp: string | null | undefined): number {
    if (!timestamp) {
        return Number.NEGATIVE_INFINITY;
    }

    const parsedValue = Date.parse(timestamp);
    return Number.isNaN(parsedValue) ? Number.NEGATIVE_INFINITY : parsedValue;
}

function compareByRecency(left: GroupableAsset, right: GroupableAsset): number {
    const recencyDelta = getTimestampValue(right.exifDatetime ?? right.createdAt)
        - getTimestampValue(left.exifDatetime ?? left.createdAt);
    if (recencyDelta !== 0) {
        return recencyDelta;
    }

    return left.id.localeCompare(right.id);
}

function selectRepresentative<T extends GroupableAsset>(
    assets: T[],
    comparator: (left: GroupableAsset, right: GroupableAsset) => number,
): T {
    const [selectedAsset] = [...assets].sort(comparator);
    if (!selectedAsset) {
        throw new Error('Cannot select a representative from an empty asset set.');
    }
    return selectedAsset;
}

export function selectDuplicateRepresentative<T extends GroupableAsset>(assets: T[]): T {
    return selectRepresentative(assets, compareByQuality);
}

export function selectNearDuplicateRepresentative<T extends GroupableAsset>(assets: T[]): T {
    return selectRepresentative(assets, compareByQuality);
}

export function selectVariantRepresentative<T extends GroupableAsset>(assets: T[]): T {
    return selectRepresentative(assets, compareByRecency);
}

export function selectBurstRepresentative<T extends GroupableAsset>(assets: T[]): T {
    return selectRepresentative(assets, compareByRecency);
}
