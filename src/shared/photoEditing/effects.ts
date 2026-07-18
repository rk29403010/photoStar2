export const PHOTO_EFFECT_KIND = {
    ripple: 0,
    sunburst: 1,
    lensFlare: 2,
    lightLeak: 3,
} as const;

export type PhotoEffectKind = typeof PHOTO_EFFECT_KIND[keyof typeof PHOTO_EFFECT_KIND];
export type PhotoEffectValues = Record<string, number | boolean>;

export const PHOTO_EFFECT_DEFAULTS: Record<PhotoEffectKind, PhotoEffectValues> = {
    [PHOTO_EFFECT_KIND.ripple]: {
        effectType: PHOTO_EFFECT_KIND.ripple,
        centerX: 0.5,
        centerY: 0.5,
        size: 0.45,
        intensity: 0.55,
        wavelength: 0.08,
        softness: 0.65,
    },
    [PHOTO_EFFECT_KIND.sunburst]: {
        effectType: PHOTO_EFFECT_KIND.sunburst,
        centerX: 0.5,
        centerY: 0.5,
        size: 0.7,
        intensity: 0.55,
        rayCount: 18,
        rotation: 0,
        variant: 0,
        hue: 42,
        softness: 0.45,
    },
    [PHOTO_EFFECT_KIND.lensFlare]: {
        effectType: PHOTO_EFFECT_KIND.lensFlare,
        centerX: 0.5,
        centerY: 0.5,
        size: 0.42,
        intensity: 0.6,
        hue: 45,
        softness: 0.55,
    },
    [PHOTO_EFFECT_KIND.lightLeak]: {
        effectType: PHOTO_EFFECT_KIND.lightLeak,
        centerX: 0.15,
        centerY: 0.5,
        size: 0.58,
        intensity: 0.55,
        hue: 18,
        softness: 0.7,
    },
};

type PixelBuffer = Uint8Array | Uint8ClampedArray;
type EffectContext = {
    centerX: number;
    centerY: number;
    height: number;
    minimumEdge: number;
    source: PixelBuffer;
    values: PhotoEffectValues;
    width: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function numberValue(values: PhotoEffectValues, key: string, fallback: number): number {
    const candidate = values[key];
    return typeof candidate === 'number' && Number.isFinite(candidate)
        ? candidate
        : fallback;
}

export function readPhotoEffectKind(values: PhotoEffectValues): PhotoEffectKind {
    const kind = Math.round(numberValue(values, 'effectType', PHOTO_EFFECT_KIND.ripple));
    return kind >= PHOTO_EFFECT_KIND.ripple && kind <= PHOTO_EFFECT_KIND.lightLeak
        ? kind as PhotoEffectKind
        : PHOTO_EFFECT_KIND.ripple;
}

export function valuesForPhotoEffect(
    kind: PhotoEffectKind,
    current: PhotoEffectValues = {},
): PhotoEffectValues {
    return {
        ...PHOTO_EFFECT_DEFAULTS[kind],
        centerX: clamp(numberValue(current, 'centerX', 0.5), 0, 1),
        centerY: clamp(numberValue(current, 'centerY', 0.5), 0, 1),
    };
}

function sampleBilinear(
    source: PixelBuffer,
    width: number,
    height: number,
    x: number,
    y: number,
    target: Uint8ClampedArray,
    targetOffset: number,
): void {
    const boundedX = clamp(x, 0, width - 1);
    const boundedY = clamp(y, 0, height - 1);
    const left = Math.floor(boundedX);
    const top = Math.floor(boundedY);
    const right = Math.min(width - 1, left + 1);
    const bottom = Math.min(height - 1, top + 1);
    const fractionX = boundedX - left;
    const fractionY = boundedY - top;
    for (let channel = 0; channel < 4; channel += 1) {
        const topValue = source[(top * width + left) * 4 + channel] * (1 - fractionX)
            + source[(top * width + right) * 4 + channel] * fractionX;
        const bottomValue = source[(bottom * width + left) * 4 + channel] * (1 - fractionX)
            + source[(bottom * width + right) * 4 + channel] * fractionX;
        target[targetOffset + channel] = topValue * (1 - fractionY) + bottomValue * fractionY;
    }
}

function applyRipple(context: EffectContext): Uint8ClampedArray {
    const output = new Uint8ClampedArray(context.source);
    const radius = clamp(numberValue(context.values, 'size', 0.45), 0.05, 1.5) * context.minimumEdge;
    const amplitude = clamp(numberValue(context.values, 'intensity', 0.55), 0, 1) * context.minimumEdge * 0.035;
    const wavelength = clamp(numberValue(context.values, 'wavelength', 0.08), 0.015, 0.3) * context.minimumEdge;
    const falloffPower = 0.5 + clamp(numberValue(context.values, 'softness', 0.65), 0, 1) * 3;
    for (let y = 0; y < context.height; y += 1) {
        for (let x = 0; x < context.width; x += 1) {
            const deltaX = x - context.centerX;
            const deltaY = y - context.centerY;
            const distance = Math.hypot(deltaX, deltaY);
            if (distance === 0 || distance >= radius) {continue;}
            const envelope = Math.pow(1 - distance / radius, falloffPower);
            const displacement = Math.sin((distance / wavelength) * Math.PI * 2) * amplitude * envelope;
            const sourceDistance = Math.max(0, distance - displacement);
            const ratio = sourceDistance / distance;
            sampleBilinear(
                context.source,
                context.width,
                context.height,
                context.centerX + deltaX * ratio,
                context.centerY + deltaY * ratio,
                output,
                (y * context.width + x) * 4,
            );
        }
    }
    return output;
}

type Rgb = { blue: number; green: number; red: number };

function hueColour(hue: number): Rgb {
    const radians = ((hue % 360) / 360) * Math.PI * 2;
    return {
        red: 210 + 45 * Math.cos(radians),
        green: 170 + 75 * Math.cos(radians - (Math.PI * 2) / 3),
        blue: 145 + 85 * Math.cos(radians - (Math.PI * 4) / 3),
    };
}

function screenPixel(
    source: PixelBuffer,
    output: Uint8ClampedArray,
    offset: number,
    colour: Rgb,
    amount: number,
): void {
    const boundedAmount = clamp(amount, 0, 1);
    output[offset] = source[offset] + (255 - source[offset]) * (colour.red / 255) * boundedAmount;
    output[offset + 1] = source[offset + 1] + (255 - source[offset + 1]) * (colour.green / 255) * boundedAmount;
    output[offset + 2] = source[offset + 2] + (255 - source[offset + 2]) * (colour.blue / 255) * boundedAmount;
    output[offset + 3] = source[offset + 3];
}

function sunburstRay(angle: number, rayCount: number, variant: number): number {
    const wave = Math.cos(angle * rayCount);
    if (variant === 1) {return Math.pow((wave + 1) / 2, 1.5);}
    if (variant === 2) {return Math.pow(Math.abs(wave), 5);}
    return Math.pow(Math.max(0, wave), 3);
}

function applySunburst(context: EffectContext): Uint8ClampedArray {
    const output = new Uint8ClampedArray(context.source.length);
    const radius = clamp(numberValue(context.values, 'size', 0.7), 0.1, 1.5) * context.minimumEdge;
    const intensity = clamp(numberValue(context.values, 'intensity', 0.55), 0, 1);
    const rays = Math.round(clamp(numberValue(context.values, 'rayCount', 18), 4, 64));
    const rotation = numberValue(context.values, 'rotation', 0) * Math.PI / 180;
    const variant = Math.round(clamp(numberValue(context.values, 'variant', 0), 0, 2));
    const softness = clamp(numberValue(context.values, 'softness', 0.45), 0, 1);
    const colour = hueColour(numberValue(context.values, 'hue', 42));
    for (let y = 0; y < context.height; y += 1) {
        for (let x = 0; x < context.width; x += 1) {
            const offset = (y * context.width + x) * 4;
            const deltaX = x - context.centerX;
            const deltaY = y - context.centerY;
            const distance = Math.hypot(deltaX, deltaY);
            const radial = clamp(1 - distance / radius, 0, 1);
            const fade = Math.pow(radial, 0.5 + softness * 2.5);
            const ray = sunburstRay(Math.atan2(deltaY, deltaX) + rotation, rays, variant);
            const core = Math.exp(-distance / Math.max(1, radius * 0.12));
            screenPixel(context.source, output, offset, colour, intensity * fade * (0.2 + ray * 0.8 + core));
        }
    }
    return output;
}

function gaussian(distance: number, radius: number): number {
    if (radius <= 0) {return 0;}
    const ratio = distance / radius;
    return Math.exp(-(ratio * ratio) * 3.2);
}

function flareAmount(context: EffectContext, x: number, y: number, radius: number): number {
    const sourceGlow = gaussian(Math.hypot(x - context.centerX, y - context.centerY), radius);
    const axisX = (context.width / 2) - context.centerX;
    const axisY = (context.height / 2) - context.centerY;
    const positions = [0.45, 0.9, 1.35];
    let artifacts = 0;
    for (let index = 0; index < positions.length; index += 1) {
        const factor = positions[index];
        const flareX = context.centerX + axisX * factor;
        const flareY = context.centerY + axisY * factor;
        const flareRadius = radius * (0.09 + index * 0.035);
        artifacts += gaussian(Math.hypot(x - flareX, y - flareY), flareRadius) * (0.55 - index * 0.1);
    }
    const distance = Math.hypot(x - context.centerX, y - context.centerY);
    const halo = Math.exp(-Math.pow((distance - radius * 0.42) / Math.max(1, radius * 0.04), 2)) * 0.35;
    return sourceGlow + artifacts + halo;
}

function applyLensFlare(context: EffectContext): Uint8ClampedArray {
    const output = new Uint8ClampedArray(context.source.length);
    const radius = clamp(numberValue(context.values, 'size', 0.42), 0.08, 1.2) * context.minimumEdge;
    const intensity = clamp(numberValue(context.values, 'intensity', 0.6), 0, 1);
    const softness = 0.5 + clamp(numberValue(context.values, 'softness', 0.55), 0, 1);
    const colour = hueColour(numberValue(context.values, 'hue', 45));
    for (let y = 0; y < context.height; y += 1) {
        for (let x = 0; x < context.width; x += 1) {
            const offset = (y * context.width + x) * 4;
            const amount = Math.pow(clamp(flareAmount(context, x, y, radius), 0, 1), softness) * intensity;
            screenPixel(context.source, output, offset, colour, amount);
        }
    }
    return output;
}

function applyLightLeak(context: EffectContext): Uint8ClampedArray {
    const output = new Uint8ClampedArray(context.source.length);
    const radius = clamp(numberValue(context.values, 'size', 0.58), 0.08, 1.5) * context.minimumEdge;
    const intensity = clamp(numberValue(context.values, 'intensity', 0.55), 0, 1);
    const softness = clamp(numberValue(context.values, 'softness', 0.7), 0.05, 1);
    const colour = hueColour(numberValue(context.values, 'hue', 18));
    for (let y = 0; y < context.height; y += 1) {
        for (let x = 0; x < context.width; x += 1) {
            const offset = (y * context.width + x) * 4;
            const distance = Math.hypot(x - context.centerX, y - context.centerY);
            const radial = clamp(1 - distance / radius, 0, 1);
            const amount = Math.pow(radial, 0.4 + softness * 2) * intensity;
            screenPixel(context.source, output, offset, colour, amount);
        }
    }
    return output;
}

export function applyPhotoEffectPixels(
    source: PixelBuffer,
    width: number,
    height: number,
    values: PhotoEffectValues,
): Uint8ClampedArray {
    if (width <= 0 || height <= 0 || source.length !== width * height * 4) {
        return new Uint8ClampedArray(source);
    }
    const context: EffectContext = {
        centerX: clamp(numberValue(values, 'centerX', 0.5), 0, 1) * Math.max(0, width - 1),
        centerY: clamp(numberValue(values, 'centerY', 0.5), 0, 1) * Math.max(0, height - 1),
        height,
        minimumEdge: Math.min(width, height),
        source,
        values,
        width,
    };
    const kind = readPhotoEffectKind(values);
    if (kind === PHOTO_EFFECT_KIND.sunburst) {return applySunburst(context);}
    if (kind === PHOTO_EFFECT_KIND.lensFlare) {return applyLensFlare(context);}
    if (kind === PHOTO_EFFECT_KIND.lightLeak) {return applyLightLeak(context);}
    return applyRipple(context);
}
