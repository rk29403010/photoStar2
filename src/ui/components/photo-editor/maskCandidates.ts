import type { Asset, NormalizedBox, NormalizedPoint, PhotoEditMask, PhotoMaskMetadataItem } from '@contracts/core';

export type PhotoMaskCandidate = {
    description: string;
    id: string;
    mask: Omit<PhotoEditMask, 'id'>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function cleanFloat(value: number): number {
    return Number.parseFloat(value.toFixed(6));
}

function normalizedBoxRecord(value: unknown): Record<string, unknown> | null {
    if (!isRecord(value)) {return null;}
    const nested = value.bounding_box ?? value.box ?? value;
    return isRecord(nested) ? nested : null;
}

function hasBoxNumbers(box: Record<string, unknown>): box is Record<'height' | 'width' | 'x' | 'y', number> {
    return finiteNumber(box.x) && finiteNumber(box.y) && finiteNumber(box.width) && finiteNumber(box.height);
}

export function readNormalizedBox(value: unknown): NormalizedBox | null {
    const nested = normalizedBoxRecord(value);
    if (!nested || !hasBoxNumbers(nested)) {return null;}
    const x = cleanFloat(Math.max(0, Math.min(1, nested.x)));
    const y = cleanFloat(Math.max(0, Math.min(1, nested.y)));
    const width = cleanFloat(Math.max(0, Math.min(1 - x, nested.width)));
    const height = cleanFloat(Math.max(0, Math.min(1 - y, nested.height)));
    return width > 0 && height > 0 ? { x, y, width, height } : null;
}

function readNormalizedPoints(value: unknown): NormalizedPoint[] {
    if (!Array.isArray(value)) {return [];}
    return value.flatMap((point) => {
        if (!isRecord(point) || !finiteNumber(point.x) || !finiteNumber(point.y)) {return [];}
        return [{ x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) }];
    });
}

function automaticMask(input: Pick<PhotoEditMask, 'box' | 'inverted' | 'kind' | 'name' | 'points' | 'raster'>): Omit<PhotoEditMask, 'id'> {
    return { ...input, feather: 0.02, source: 'automatic' };
}

function metadataGeometry(item: PhotoMaskMetadataItem): Pick<PhotoEditMask, 'box' | 'points' | 'raster'> | null {
    if (item.raster) {return { raster: item.raster };}
    if (item.points && item.points.length >= 3) {return { points: item.points };}
    if (item.box) {return { box: item.box };}
    return null;
}

function standardizedMetadataCandidates(asset: Asset): PhotoMaskCandidate[] {
    return (asset.mask_metadata?.masks ?? []).flatMap((item: PhotoMaskMetadataItem) => {
        const geometry = metadataGeometry(item);
        if (!geometry) {return [];}
        return [{
            id: `metadata-${item.source.moduleId}-${item.source.referenceId}`,
            description: item.description,
            mask: automaticMask({
                ...geometry,
                kind: item.kind,
                name: item.label,
                inverted: item.inverted ?? false,
            }),
        }];
    });
}

function frameGeometry(points: NormalizedPoint[], box: NormalizedBox | null): Pick<PhotoEditMask, 'box' | 'kind' | 'points'> | null {
    if (points.length >= 3) {return { kind: 'polygon', points };}
    if (box) {return { kind: 'rectangle', box };}
    return null;
}

function frameCandidates(asset: Asset): PhotoMaskCandidate[] {
    const frame = asset.frame_detection;
    if (!frame) {return [];}
    const points = readNormalizedPoints(frame.points);
    const box = readNormalizedBox(frame.box);
    const geometry = frameGeometry(points, box);
    if (!geometry) {return [];}
    return [
        {
            id: 'frame-photo-content',
            description: 'Detected photo area from runtime.detect_frame',
            mask: automaticMask({ ...geometry, name: 'Detected photo area', inverted: false }),
        },
        {
            id: 'frame-outside-content',
            description: 'Area outside the detected photo boundary',
            mask: automaticMask({ ...geometry, name: 'Outside detected photo', inverted: true }),
        },
    ];
}

function faceCandidates(asset: Asset): PhotoMaskCandidate[] {
    return (asset.faces ?? []).flatMap((face, index) => {
        const box = readNormalizedBox(face.box);
        if (!box) {return [];}
        const label = face.person_name ?? `Face ${index + 1}`;
        return [{
            id: `face-${index}`,
            description: 'Locally detected face',
            mask: automaticMask({ box, kind: 'ellipse', name: label, inverted: false }),
        }];
    });
}

function metadataCandidates(asset: Asset, field: 'regionsOfInterest' | 'subjects'): PhotoMaskCandidate[] {
    const values = asset.photo_metadata?.projection[field] ?? [];
    return values.flatMap((value, index) => {
        const box = readNormalizedBox(value);
        if (!box || !isRecord(value)) {return [];}
        const fallback = field === 'subjects' ? `Subject ${index + 1}` : `Region ${index + 1}`;
        const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : fallback;
        return [{
            id: `${field}-${index}`,
            description: field === 'subjects' ? 'Analysed photo subject' : 'Analysed region of interest',
            mask: automaticMask({
                box,
                kind: field === 'subjects' ? 'subject' : 'element',
                name: label,
                inverted: false,
            }),
        }];
    });
}

export function buildPhotoMaskCandidates(asset: Asset): PhotoMaskCandidate[] {
    const standardized = standardizedMetadataCandidates(asset);
    if (standardized.length > 0) {return standardized;}
    return [
        ...frameCandidates(asset),
        ...faceCandidates(asset),
        ...metadataCandidates(asset, 'subjects'),
        ...metadataCandidates(asset, 'regionsOfInterest'),
    ];
}

export function instantiateMaskCandidate(candidate: PhotoMaskCandidate): PhotoEditMask {
    return { ...candidate.mask, id: crypto.randomUUID() };
}
