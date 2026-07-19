import type { CSSProperties } from 'react';
import type { PhotoEditOperation } from '@contracts/core';

function numericValue(operation: PhotoEditOperation, key: string, fallback: number): number {
    const value = operation.values[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function fixed(value: number): string {
    return value.toFixed(3);
}

function adjustmentFilter(current: PhotoEditOperation, baseline: PhotoEditOperation): string {
    const brightness = 1 + (numericValue(current, 'brightness', 0) - numericValue(baseline, 'brightness', 0)) / 200;
    const contrast = 1 + (numericValue(current, 'contrast', 0) - numericValue(baseline, 'contrast', 0)) / 100;
    const saturation = 1 + (numericValue(current, 'saturation', 0) - numericValue(baseline, 'saturation', 0)) / 100;
    const hue = numericValue(current, 'hue', 0) - numericValue(baseline, 'hue', 0);
    return `brightness(${fixed(brightness)}) contrast(${fixed(contrast)}) saturate(${fixed(saturation)}) hue-rotate(${fixed(hue)}deg)`;
}

function dehazeFilter(current: PhotoEditOperation, baseline: PhotoEditOperation): string {
    const delta = numericValue(current, 'strength', 0.45) - numericValue(baseline, 'strength', 0.45);
    return `contrast(${fixed(1 + delta * 0.7)}) saturate(${fixed(1 + delta * 0.35)}) brightness(${fixed(1 - delta * 0.1)})`;
}

function detailFilter(current: PhotoEditOperation, baseline: PhotoEditOperation): string {
    const delta = numericValue(current, 'sigma', 1) - numericValue(baseline, 'sigma', 1);
    return `contrast(${fixed(1 + delta * 0.04)}) saturate(${fixed(1 + delta * 0.015)})`;
}

function restoreFilter(current: PhotoEditOperation, baseline: PhotoEditOperation): string {
    const brightness = numericValue(current, 'fadeRecovery', 1.08) / numericValue(baseline, 'fadeRecovery', 1.08);
    const saturation = numericValue(current, 'saturation', 1.08) / numericValue(baseline, 'saturation', 1.08);
    const contrast = 1 + numericValue(current, 'contrast', 0.12) - numericValue(baseline, 'contrast', 0.12);
    return `brightness(${fixed(brightness)}) contrast(${fixed(contrast)}) saturate(${fixed(saturation)})`;
}

type LiveStyleHandler = (current: PhotoEditOperation, baseline: PhotoEditOperation) => CSSProperties;

const blurStyle: LiveStyleHandler = (current, baseline) => {
    const delta = numericValue(current, 'sigma', 2) - numericValue(baseline, 'sigma', 2);
    return delta >= 0 ? { filter: `blur(${fixed(delta * 0.75)}px)` } : { filter: `contrast(${fixed(1 - delta * 0.02)})` };
};

const rotateStyle: LiveStyleHandler = (current, baseline) => {
    const delta = numericValue(current, 'angle', 0) - numericValue(baseline, 'angle', 0);
    return { transform: `rotate(${fixed(delta)}deg)` };
};

const LIVE_STYLE_HANDLERS: Partial<Record<PhotoEditOperation['tool'], LiveStyleHandler>> = {
    adjust: (current, baseline) => ({ filter: adjustmentFilter(current, baseline) }),
    blur: blurStyle,
    dehaze: (current, baseline) => ({ filter: dehazeFilter(current, baseline) }),
    restore: (current, baseline) => ({ filter: restoreFilter(current, baseline) }),
    rotate: rotateStyle,
    sharpen: (current, baseline) => ({ filter: detailFilter(current, baseline) }),
};

export function getLivePreviewStyle(current: PhotoEditOperation, baseline: PhotoEditOperation): CSSProperties | undefined {
    if (current.id !== baseline.id || current.tool !== baseline.tool || current.maskId) {return undefined;}
    return LIVE_STYLE_HANDLERS[current.tool]?.(current, baseline);
}
