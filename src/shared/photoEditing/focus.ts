export const FOCUS_SHAPE = {
    circular: 0,
    straight: 1,
} as const;

export const FOCUS_STYLE = {
    softBlur: 0,
    radialZoom: 1,
    motionStreak: 2,
    orbitalBlur: 3,
} as const;

export const MAX_FOCUS_POINTS = 5;

export type FocusPoint = { x: number; y: number };
export type FocusValues = Record<string, number | boolean>;
export type FocusShape = typeof FOCUS_SHAPE[keyof typeof FOCUS_SHAPE];
export type FocusStyle = typeof FOCUS_STYLE[keyof typeof FOCUS_STYLE];
type PixelBuffer = Uint8Array | Uint8ClampedArray;

export const FOCUS_DEFAULTS: FocusValues = {
    shape: FOCUS_SHAPE.circular,
    style: FOCUS_STYLE.softBlur,
    pointCount: 1,
    pointX0: 0.5,
    pointY0: 0.45,
    selectedPoint: 0,
    size: 0.2,
    falloff: 0.18,
    angle: 0,
    strength: 0.55,
    inverted: false,
};

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function numberValue(values: FocusValues, key: string, fallback: number): number {
    const candidate = values[key];
    return typeof candidate === 'number' && Number.isFinite(candidate)
        ? candidate
        : fallback;
}

function booleanValue(values: FocusValues, key: string, fallback: boolean): boolean {
    const candidate = values[key];
    return typeof candidate === 'boolean' ? candidate : fallback;
}

export function readFocusShape(values: FocusValues): FocusShape {
    return Math.round(numberValue(values, 'shape', FOCUS_SHAPE.circular)) === FOCUS_SHAPE.straight
        ? FOCUS_SHAPE.straight
        : FOCUS_SHAPE.circular;
}

export function readFocusStyle(values: FocusValues): FocusStyle {
    const style = Math.round(numberValue(values, 'style', FOCUS_STYLE.softBlur));
    return style >= FOCUS_STYLE.softBlur && style <= FOCUS_STYLE.orbitalBlur
        ? style as FocusStyle
        : FOCUS_STYLE.softBlur;
}

export function readFocusPoints(values: FocusValues): FocusPoint[] {
    const count = Math.round(clamp(numberValue(values, 'pointCount', 1), 1, MAX_FOCUS_POINTS));
    return Array.from({ length: count }, (_, index) => ({
        x: clamp(numberValue(values, `pointX${index}`, index === 0 ? 0.5 : 0.35 + index * 0.1), 0, 1),
        y: clamp(numberValue(values, `pointY${index}`, index === 0 ? 0.45 : 0.5), 0, 1),
    }));
}

export function writeFocusPoints(
    values: FocusValues,
    points: readonly FocusPoint[],
    selectedPoint = 0,
): FocusValues {
    const bounded = points.slice(0, MAX_FOCUS_POINTS);
    const next: FocusValues = {
        ...values,
        pointCount: Math.max(1, bounded.length),
        selectedPoint: clamp(selectedPoint, 0, Math.max(0, bounded.length - 1)),
    };
    (bounded.length > 0 ? bounded : [{ x: 0.5, y: 0.45 }]).forEach((point, index) => {
        next[`pointX${index}`] = clamp(point.x, 0, 1);
        next[`pointY${index}`] = clamp(point.y, 0, 1);
    });
    return next;
}

const PRESET_POINTS: Record<string, FocusPoint[]> = {
    portrait: [{ x: 0.5, y: 0.42 }],
    tiltShift: [{ x: 0.5, y: 0.52 }],
    group: [{ x: 0.3, y: 0.42 }, { x: 0.5, y: 0.58 }, { x: 0.7, y: 0.42 }],
    tunnel: [{ x: 0.5, y: 0.5 }],
    orbit: [{ x: 0.5, y: 0.5 }],
};

export type FocusPreset = keyof typeof PRESET_POINTS;

export function focusPresetValues(preset: FocusPreset, current: FocusValues): FocusValues {
    const shared = { ...FOCUS_DEFAULTS, ...current };
    if (preset === 'tiltShift') {
        return writeFocusPoints({ ...shared, shape: FOCUS_SHAPE.straight, style: FOCUS_STYLE.softBlur, size: 0.15, falloff: 0.16, angle: 0, strength: 0.68, inverted: false }, PRESET_POINTS[preset]);
    }
    if (preset === 'group') {
        return writeFocusPoints({ ...shared, shape: FOCUS_SHAPE.circular, style: FOCUS_STYLE.softBlur, size: 0.12, falloff: 0.15, strength: 0.58, inverted: false }, PRESET_POINTS[preset], 1);
    }
    if (preset === 'tunnel') {
        return writeFocusPoints({ ...shared, shape: FOCUS_SHAPE.circular, style: FOCUS_STYLE.radialZoom, size: 0.14, falloff: 0.28, strength: 0.68, inverted: false }, PRESET_POINTS[preset]);
    }
    if (preset === 'orbit') {
        return writeFocusPoints({ ...shared, shape: FOCUS_SHAPE.circular, style: FOCUS_STYLE.orbitalBlur, size: 0.17, falloff: 0.25, strength: 0.62, inverted: false }, PRESET_POINTS[preset]);
    }
    return writeFocusPoints({ ...shared, shape: FOCUS_SHAPE.circular, style: FOCUS_STYLE.softBlur, size: 0.18, falloff: 0.2, strength: 0.55, inverted: false }, PRESET_POINTS.portrait);
}

function smoothstep(start: number, end: number, value: number): number {
    if (end <= start) {return value >= end ? 1 : 0;}
    const progress = clamp((value - start) / (end - start), 0, 1);
    return progress * progress * (3 - 2 * progress);
}

function blurHorizontal(source: PixelBuffer, width: number, height: number, radius: number): Uint8ClampedArray {
    const output = new Uint8ClampedArray(source.length);
    const windowSize = radius * 2 + 1;
    for (let y = 0; y < height; y += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
            let sum = 0;
            for (let offset = -radius; offset <= radius; offset += 1) {
                sum += source[(y * width + clamp(offset, 0, width - 1)) * 4 + channel];
            }
            for (let x = 0; x < width; x += 1) {
                output[(y * width + x) * 4 + channel] = sum / windowSize;
                const leaving = clamp(x - radius, 0, width - 1);
                const entering = clamp(x + radius + 1, 0, width - 1);
                sum += source[(y * width + entering) * 4 + channel]
                    - source[(y * width + leaving) * 4 + channel];
            }
        }
        for (let x = 0; x < width; x += 1) {
            output[(y * width + x) * 4 + 3] = source[(y * width + x) * 4 + 3];
        }
    }
    return output;
}

function blurVertical(source: PixelBuffer, width: number, height: number, radius: number): Uint8ClampedArray {
    const output = new Uint8ClampedArray(source.length);
    const windowSize = radius * 2 + 1;
    for (let x = 0; x < width; x += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
            let sum = 0;
            for (let offset = -radius; offset <= radius; offset += 1) {
                sum += source[(clamp(offset, 0, height - 1) * width + x) * 4 + channel];
            }
            for (let y = 0; y < height; y += 1) {
                output[(y * width + x) * 4 + channel] = sum / windowSize;
                const leaving = clamp(y - radius, 0, height - 1);
                const entering = clamp(y + radius + 1, 0, height - 1);
                sum += source[(entering * width + x) * 4 + channel]
                    - source[(leaving * width + x) * 4 + channel];
            }
        }
        for (let y = 0; y < height; y += 1) {
            output[(y * width + x) * 4 + 3] = source[(y * width + x) * 4 + 3];
        }
    }
    return output;
}

function boxBlur(source: PixelBuffer, width: number, height: number, radius: number): Uint8ClampedArray {
    if (radius <= 0) {return new Uint8ClampedArray(source);}
    return blurVertical(blurHorizontal(source, width, height, radius), width, height, radius);
}

type FocusContext = {
    angle: number;
    falloff: number;
    height: number;
    inverted: boolean;
    minimumEdge: number;
    points: FocusPoint[];
    shape: FocusShape;
    size: number;
    source: PixelBuffer;
    strength: number;
    style: FocusStyle;
    width: number;
};

function pixelPoint(context: FocusContext, x: number, y: number): FocusPoint {
    let closest = context.points[0];
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const point of context.points) {
        const distance = Math.hypot(x - point.x * context.width, y - point.y * context.height);
        if (distance < closestDistance) {
            closest = point;
            closestDistance = distance;
        }
    }
    return closest;
}

function focusDistance(context: FocusContext, x: number, y: number): number {
    let closest = Number.POSITIVE_INFINITY;
    const sine = Math.sin(context.angle);
    const cosine = Math.cos(context.angle);
    for (const point of context.points) {
        const deltaX = x - point.x * context.width;
        const deltaY = y - point.y * context.height;
        const distance = context.shape === FOCUS_SHAPE.straight
            ? Math.abs((-sine * deltaX) + (cosine * deltaY))
            : Math.hypot(deltaX, deltaY);
        closest = Math.min(closest, distance / context.minimumEdge);
    }
    return closest;
}

function focusWeight(context: FocusContext, x: number, y: number): number {
    const outsideWeight = smoothstep(context.size, context.size + context.falloff, focusDistance(context, x, y));
    return context.inverted ? 1 - outsideWeight : outsideWeight;
}

function sampleChannel(source: PixelBuffer, width: number, height: number, x: number, y: number, channel: number): number {
    const boundedX = clamp(Math.round(x), 0, width - 1);
    const boundedY = clamp(Math.round(y), 0, height - 1);
    return source[(boundedY * width + boundedX) * 4 + channel];
}

function averageSamples(
    context: FocusContext,
    channel: number,
    positions: readonly FocusPoint[],
): number {
    let sum = 0;
    for (const position of positions) {
        sum += sampleChannel(context.source, context.width, context.height, position.x, position.y, channel);
    }
    return sum / positions.length;
}

function radialZoomValue(context: FocusContext, x: number, y: number, channel: number): number {
    const point = pixelPoint(context, x, y);
    const centreX = point.x * context.width;
    const centreY = point.y * context.height;
    const scale = context.strength * 0.055;
    return averageSamples(context, channel, [0, 0.25, 0.5, 0.75, 1].map((step) => ({
        x: x - (x - centreX) * scale * step,
        y: y - (y - centreY) * scale * step,
    })));
}

function motionStreakValue(context: FocusContext, x: number, y: number, channel: number): number {
    const distance = context.strength * context.minimumEdge * 0.045;
    const cosine = Math.cos(context.angle);
    const sine = Math.sin(context.angle);
    return averageSamples(context, channel, [-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((step) => ({
        x: x + cosine * distance * step,
        y: y + sine * distance * step,
    })));
}

function orbitalBlurValue(context: FocusContext, x: number, y: number, channel: number): number {
    const point = pixelPoint(context, x, y);
    const centreX = point.x * context.width;
    const centreY = point.y * context.height;
    const deltaX = x - centreX;
    const deltaY = y - centreY;
    const arc = context.strength * 0.12;
    return averageSamples(context, channel, [-1, -0.5, 0, 0.5, 1].map((step) => {
        const angle = arc * step;
        return {
            x: centreX + deltaX * Math.cos(angle) - deltaY * Math.sin(angle),
            y: centreY + deltaX * Math.sin(angle) + deltaY * Math.cos(angle),
        };
    }));
}

function styledValue(
    context: FocusContext,
    blurred: PixelBuffer,
    x: number,
    y: number,
    channel: number,
): number {
    if (context.style === FOCUS_STYLE.radialZoom) {return radialZoomValue(context, x, y, channel);}
    if (context.style === FOCUS_STYLE.motionStreak) {return motionStreakValue(context, x, y, channel);}
    if (context.style === FOCUS_STYLE.orbitalBlur) {return orbitalBlurValue(context, x, y, channel);}
    return blurred[(y * context.width + x) * 4 + channel];
}

function createFocusContext(
    source: PixelBuffer,
    width: number,
    height: number,
    values: FocusValues,
): FocusContext {
    return {
        angle: numberValue(values, 'angle', 0) * Math.PI / 180,
        falloff: clamp(numberValue(values, 'falloff', 0.18), 0.005, 0.8),
        height,
        inverted: booleanValue(values, 'inverted', false),
        minimumEdge: Math.max(1, Math.min(width, height)),
        points: readFocusPoints(values),
        shape: readFocusShape(values),
        size: clamp(numberValue(values, 'size', 0.2), 0.01, 0.8),
        source,
        strength: clamp(numberValue(values, 'strength', 0.55), 0, 1),
        style: readFocusStyle(values),
        width,
    };
}

export function applyFocusPixels(
    source: PixelBuffer,
    width: number,
    height: number,
    values: FocusValues,
    preparedBlurred?: PixelBuffer,
): Uint8ClampedArray {
    if (width <= 0 || height <= 0 || source.length !== width * height * 4) {
        return new Uint8ClampedArray(source);
    }
    const context = createFocusContext(source, width, height, values);
    if (context.strength === 0) {return new Uint8ClampedArray(source);}
    const blurred = preparedBlurred?.length === source.length
        ? preparedBlurred
        : prepareFocusBlurredPixels(source, width, height, context.strength);
    const output = new Uint8ClampedArray(source.length);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            const amount = focusWeight(context, x, y) * context.strength;
            for (let channel = 0; channel < 3; channel += 1) {
                const target = styledValue(context, blurred, x, y, channel);
                output[offset + channel] = source[offset + channel] * (1 - amount) + target * amount;
            }
            output[offset + 3] = source[offset + 3];
        }
    }
    return output;
}

export function prepareFocusBlurredPixels(
    source: PixelBuffer,
    width: number,
    height: number,
    strength: number,
): Uint8ClampedArray {
    const minimumEdge = Math.max(1, Math.min(width, height));
    const radius = Math.round(clamp(strength, 0, 1) * minimumEdge * 0.035);
    return boxBlur(source, width, height, clamp(radius, 0, 96));
}
