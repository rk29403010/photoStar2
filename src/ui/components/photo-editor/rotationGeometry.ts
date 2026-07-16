import type { NormalizedPoint } from '@contracts/core';

export type RotationLayout = {
    height: number;
    minX: number;
    minY: number;
    pivotX: number;
    pivotY: number;
    width: number;
};

type RotationLayoutInput = {
    angle: number;
    expandCanvas: boolean;
    height: number;
    pivot: NormalizedPoint;
    width: number;
};

function rotatePoint(point: NormalizedPoint, pivot: NormalizedPoint, radians: number): NormalizedPoint {
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const x = point.x - pivot.x;
    const y = point.y - pivot.y;
    return {
        x: pivot.x + (x * cosine) - (y * sine),
        y: pivot.y + (x * sine) + (y * cosine),
    };
}

export function clampNormalizedPoint(point: NormalizedPoint): NormalizedPoint {
    return {
        x: Math.min(1, Math.max(0, point.x)),
        y: Math.min(1, Math.max(0, point.y)),
    };
}

export function straightenCorrection(start: NormalizedPoint, end: NormalizedPoint): number {
    const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
    return (Math.round(angle / 90) * 90) - angle;
}

export function normalizeRotationAngle(angle: number): number {
    if (!Number.isFinite(angle)) {return 0;}
    const normalized = ((angle + 180) % 360 + 360) % 360 - 180;
    return normalized === -180 && angle > 0 ? 180 : normalized;
}

export function snapRotationAngle(angle: number, fiveDegreeSteps: boolean): number {
    const step = fiveDegreeSteps ? 5 : 1;
    return normalizeRotationAngle(Math.round(angle / step) * step);
}

export function rotationLayout(input: RotationLayoutInput): RotationLayout {
    const pivot = { x: input.pivot.x * input.width, y: input.pivot.y * input.height };
    if (!input.expandCanvas) {
        return { height: input.height, minX: 0, minY: 0, pivotX: pivot.x, pivotY: pivot.y, width: input.width };
    }
    const radians = input.angle * Math.PI / 180;
    const corners = [
        { x: 0, y: 0 }, { x: input.width, y: 0 },
        { x: input.width, y: input.height }, { x: 0, y: input.height },
    ].map((point) => rotatePoint(point, pivot, radians));
    const minX = Math.min(0, ...corners.map((point) => point.x));
    const minY = Math.min(0, ...corners.map((point) => point.y));
    const maxX = Math.max(input.width, ...corners.map((point) => point.x));
    const maxY = Math.max(input.height, ...corners.map((point) => point.y));
    return {
        height: Math.max(1, maxY - minY),
        minX,
        minY,
        pivotX: pivot.x - minX,
        pivotY: pivot.y - minY,
        width: Math.max(1, maxX - minX),
    };
}
