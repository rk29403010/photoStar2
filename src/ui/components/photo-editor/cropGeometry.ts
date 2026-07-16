import type { NormalizedBox, NormalizedPoint } from '@contracts/core';

export type { NormalizedBox, NormalizedPoint };

export type CropHandle =
    | 'north'
    | 'north-east'
    | 'east'
    | 'south-east'
    | 'south'
    | 'south-west'
    | 'west'
    | 'north-west';

export type CropMinimumSize = {
    width: number;
    height: number;
};

export type CropViewportState = {
    frame: NormalizedBox;
    imageOffset: NormalizedPoint;
};

export const DEFAULT_CROP_MINIMUM_SIZE: CropMinimumSize = { width: 0.05, height: 0.05 };
const ABSOLUTE_CROP_MINIMUM_SIZE: CropMinimumSize = { width: 0.001, height: 0.001 };

const WEST_HANDLES = new Set<CropHandle>(['north-west', 'west', 'south-west']);
const EAST_HANDLES = new Set<CropHandle>(['north-east', 'east', 'south-east']);
const NORTH_HANDLES = new Set<CropHandle>(['north-west', 'north', 'north-east']);
const SOUTH_HANDLES = new Set<CropHandle>(['south-west', 'south', 'south-east']);

function finiteOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function clampMinimum(value: number): number {
    return clamp(finiteOr(value, 0.05), 0.001, 1);
}

function clampAxis(start: number, size: number, minimumSize: number): { start: number; size: number } {
    const minimum = clampMinimum(minimumSize);
    const nextStart = clamp(finiteOr(start, 0), 0, 1 - minimum);
    return {
        start: nextStart,
        size: clamp(finiteOr(size, 1), minimum, 1 - nextStart),
    };
}

export function clampCropFrame(
    frame: NormalizedBox,
    minimumSize: CropMinimumSize = DEFAULT_CROP_MINIMUM_SIZE,
): NormalizedBox {
    const horizontal = clampAxis(frame.x, frame.width, minimumSize.width);
    const vertical = clampAxis(frame.y, frame.height, minimumSize.height);
    return { x: horizontal.start, y: vertical.start, width: horizontal.size, height: vertical.size };
}

export function clampImageOffset(frame: NormalizedBox, imageOffset: NormalizedPoint): NormalizedPoint {
    const safeFrame = clampCropFrame(frame, ABSOLUTE_CROP_MINIMUM_SIZE);
    return {
        x: clamp(finiteOr(imageOffset.x, 0), safeFrame.x + safeFrame.width - 1, safeFrame.x),
        y: clamp(finiteOr(imageOffset.y, 0), safeFrame.y + safeFrame.height - 1, safeFrame.y),
    };
}

export function deriveCropBox(state: CropViewportState): NormalizedBox {
    const frame = clampCropFrame(state.frame, ABSOLUTE_CROP_MINIMUM_SIZE);
    const imageOffset = clampImageOffset(frame, state.imageOffset);
    return clampCropFrame({
        x: frame.x - imageOffset.x,
        y: frame.y - imageOffset.y,
        width: frame.width,
        height: frame.height,
    }, ABSOLUTE_CROP_MINIMUM_SIZE);
}

export function panCropImage(state: CropViewportState, delta: NormalizedPoint): CropViewportState {
    const frame = clampCropFrame(state.frame, ABSOLUTE_CROP_MINIMUM_SIZE);
    const requestedOffset = {
        x: finiteOr(state.imageOffset.x, 0) + finiteOr(delta.x, 0),
        y: finiteOr(state.imageOffset.y, 0) + finiteOr(delta.y, 0),
    };
    return { frame, imageOffset: clampImageOffset(frame, requestedOffset) };
}

function resizeAxis(params: {
    start: number;
    size: number;
    delta: number;
    moveLeading: boolean;
    moveTrailing: boolean;
    minimumSize: number;
}): { start: number; size: number } {
    const end = params.start + params.size;
    const delta = finiteOr(params.delta, 0);
    const minimum = clampMinimum(params.minimumSize);
    if (params.moveLeading) {
        const nextStart = clamp(params.start + delta, 0, end - minimum);
        return { start: nextStart, size: end - nextStart };
    }
    if (params.moveTrailing) {
        const nextEnd = clamp(end + delta, params.start + minimum, 1);
        return { start: params.start, size: nextEnd - params.start };
    }
    return { start: params.start, size: params.size };
}

export function resizeCropFrame(
    frame: NormalizedBox,
    handle: CropHandle,
    delta: NormalizedPoint,
    minimumSize: CropMinimumSize = DEFAULT_CROP_MINIMUM_SIZE,
): NormalizedBox {
    const safeFrame = clampCropFrame(frame, minimumSize);
    const horizontal = resizeAxis({
        start: safeFrame.x,
        size: safeFrame.width,
        delta: delta.x,
        moveLeading: WEST_HANDLES.has(handle),
        moveTrailing: EAST_HANDLES.has(handle),
        minimumSize: minimumSize.width,
    });
    const vertical = resizeAxis({
        start: safeFrame.y,
        size: safeFrame.height,
        delta: delta.y,
        moveLeading: NORTH_HANDLES.has(handle),
        moveTrailing: SOUTH_HANDLES.has(handle),
        minimumSize: minimumSize.height,
    });
    return { x: horizontal.start, y: vertical.start, width: horizontal.size, height: vertical.size };
}

export function resizeCropViewport(
    state: CropViewportState,
    handle: CropHandle,
    delta: NormalizedPoint,
    minimumSize: CropMinimumSize = DEFAULT_CROP_MINIMUM_SIZE,
): CropViewportState {
    const frame = resizeCropFrame(state.frame, handle, delta, minimumSize);
    return { frame, imageOffset: clampImageOffset(frame, state.imageOffset) };
}

function safeAspectRatio(aspectRatio: number): number | null {
    return Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : null;
}

export function fitCropFrameToAspect(frame: NormalizedBox, aspectRatio: number): NormalizedBox {
    const safeFrame = clampCropFrame(frame, ABSOLUTE_CROP_MINIMUM_SIZE);
    const ratio = safeAspectRatio(aspectRatio);
    if (ratio === null) {return safeFrame;}
    const centreX = safeFrame.x + safeFrame.width / 2;
    const centreY = safeFrame.y + safeFrame.height / 2;
    const area = safeFrame.width * safeFrame.height;
    const requestedWidth = Math.sqrt(area * ratio);
    const requestedHeight = requestedWidth / ratio;
    const maximumWidth = 2 * Math.min(centreX, 1 - centreX);
    const maximumHeight = 2 * Math.min(centreY, 1 - centreY);
    const scale = Math.min(1, maximumWidth / requestedWidth, maximumHeight / requestedHeight);
    const width = requestedWidth * scale;
    const height = requestedHeight * scale;
    return {
        x: centreX - width / 2,
        y: centreY - height / 2,
        width,
        height,
    };
}

function constrainedSize(requested: number, minimum: number, maximum: number): number {
    const safeMaximum = Math.max(ABSOLUTE_CROP_MINIMUM_SIZE.width, maximum);
    return clamp(requested, Math.min(minimum, safeMaximum), safeMaximum);
}

function resizeCornerWithAspect(params: {
    frame: NormalizedBox;
    freeFrame: NormalizedBox;
    handle: CropHandle;
    minimumSize: CropMinimumSize;
    ratio: number;
}): NormalizedBox {
    const west = WEST_HANDLES.has(params.handle);
    const north = NORTH_HANDLES.has(params.handle);
    const anchorX = west ? params.frame.x + params.frame.width : params.frame.x;
    const anchorY = north ? params.frame.y + params.frame.height : params.frame.y;
    const maximumWidth = west ? anchorX : 1 - anchorX;
    const maximumHeight = north ? anchorY : 1 - anchorY;
    const requestedWidth = Math.max(params.freeFrame.width, params.freeFrame.height * params.ratio);
    const minimumWidth = Math.max(params.minimumSize.width, params.minimumSize.height * params.ratio);
    const width = constrainedSize(requestedWidth, minimumWidth, Math.min(maximumWidth, maximumHeight * params.ratio));
    const height = width / params.ratio;
    return { x: west ? anchorX - width : anchorX, y: north ? anchorY - height : anchorY, width, height };
}

function resizeVerticalEdgeWithAspect(params: {
    frame: NormalizedBox;
    freeFrame: NormalizedBox;
    handle: CropHandle;
    minimumSize: CropMinimumSize;
    ratio: number;
}): NormalizedBox {
    const west = WEST_HANDLES.has(params.handle);
    const anchorX = west ? params.frame.x + params.frame.width : params.frame.x;
    const centreY = params.frame.y + params.frame.height / 2;
    const maximumWidth = west ? anchorX : 1 - anchorX;
    const centredHeight = 2 * Math.min(centreY, 1 - centreY);
    const minimumWidth = Math.max(params.minimumSize.width, params.minimumSize.height * params.ratio);
    const width = constrainedSize(params.freeFrame.width, minimumWidth, Math.min(maximumWidth, centredHeight * params.ratio));
    const height = width / params.ratio;
    return { x: west ? anchorX - width : anchorX, y: centreY - height / 2, width, height };
}

function resizeHorizontalEdgeWithAspect(params: {
    frame: NormalizedBox;
    freeFrame: NormalizedBox;
    handle: CropHandle;
    minimumSize: CropMinimumSize;
    ratio: number;
}): NormalizedBox {
    const north = NORTH_HANDLES.has(params.handle);
    const anchorY = north ? params.frame.y + params.frame.height : params.frame.y;
    const centreX = params.frame.x + params.frame.width / 2;
    const maximumHeight = north ? anchorY : 1 - anchorY;
    const centredWidth = 2 * Math.min(centreX, 1 - centreX);
    const minimumHeight = Math.max(params.minimumSize.height, params.minimumSize.width / params.ratio);
    const height = constrainedSize(params.freeFrame.height, minimumHeight, Math.min(maximumHeight, centredWidth / params.ratio));
    const width = height * params.ratio;
    return { x: centreX - width / 2, y: north ? anchorY - height : anchorY, width, height };
}

export function resizeCropFrameWithAspect(
    frame: NormalizedBox,
    handle: CropHandle,
    delta: NormalizedPoint,
    aspectRatio: number,
    minimumSize: CropMinimumSize = DEFAULT_CROP_MINIMUM_SIZE,
): NormalizedBox {
    const ratio = safeAspectRatio(aspectRatio);
    if (ratio === null) {return resizeCropFrame(frame, handle, delta, minimumSize);}
    const safeFrame = fitCropFrameToAspect(frame, ratio);
    const freeFrame = resizeCropFrame(safeFrame, handle, delta, minimumSize);
    const params = { frame: safeFrame, freeFrame, handle, minimumSize, ratio };
    if (WEST_HANDLES.has(handle) || EAST_HANDLES.has(handle)) {
        if (NORTH_HANDLES.has(handle) || SOUTH_HANDLES.has(handle)) {return resizeCornerWithAspect(params);}
        return resizeVerticalEdgeWithAspect(params);
    }
    return resizeHorizontalEdgeWithAspect(params);
}

export function fitCropViewportToAspect(state: CropViewportState, aspectRatio: number): CropViewportState {
    const frame = fitCropFrameToAspect(state.frame, aspectRatio);
    return { frame, imageOffset: clampImageOffset(frame, state.imageOffset) };
}

export function resizeCropViewportWithAspect(
    state: CropViewportState,
    handle: CropHandle,
    delta: NormalizedPoint,
    aspectRatio: number,
    minimumSize: CropMinimumSize = DEFAULT_CROP_MINIMUM_SIZE,
): CropViewportState {
    const frame = resizeCropFrameWithAspect(state.frame, handle, delta, aspectRatio, minimumSize);
    return { frame, imageOffset: clampImageOffset(frame, state.imageOffset) };
}
