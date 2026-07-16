import type { PhotoEditOperation } from '@contracts/core';

export const CROP_ASPECT_WIDTH_KEY = 'aspectWidth';
export const CROP_ASPECT_HEIGHT_KEY = 'aspectHeight';
export const CROP_GUIDE_KEY = 'compositionGuide';

export type CropGuide = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export function cropOptionNumber(operation: PhotoEditOperation, key: string): number {
    const value = operation.values[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function cropAspectRatio(operation: PhotoEditOperation): number | null {
    const width = cropOptionNumber(operation, CROP_ASPECT_WIDTH_KEY);
    const height = cropOptionNumber(operation, CROP_ASPECT_HEIGHT_KEY);
    return width > 0 && height > 0 ? width / height : null;
}

export function cropAspectKey(operation: PhotoEditOperation): string {
    return `${cropOptionNumber(operation, CROP_ASPECT_WIDTH_KEY)}:${cropOptionNumber(operation, CROP_ASPECT_HEIGHT_KEY)}`;
}

export function cropGuide(operation: PhotoEditOperation): CropGuide {
    const value = cropOptionNumber(operation, CROP_GUIDE_KEY);
    return value >= 1 && value <= 14 ? value as CropGuide : 0;
}
