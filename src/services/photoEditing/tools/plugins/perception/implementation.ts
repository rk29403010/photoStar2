import sharp from 'sharp';
import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';
import { decodeRgba, encodeRgba } from '../../imageBuffer.ts';
import { PERCEPTION_DEFAULTS } from './defaults.ts';

type PerceptionSettings = {
    strength: number;
    adaptation: number;
    emphasis: number;
    suppression: number;
    colourConstancy: number;
};

type ChannelCorrections = {
    red: number;
    green: number;
    blue: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function operationValue(operation: PhotoEditOperation, key: string): number {
    const candidate = operation.values[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
    }
    const fallback = PERCEPTION_DEFAULTS[key];
    return typeof fallback === 'number' ? fallback : 0;
}

function luma(red: number, green: number, blue: number): number {
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function channelMeans(data: Buffer): { red: number; green: number; blue: number } {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
        if ((data[offset + 3] ?? 255) === 0) {
            continue;
        }
        red += data[offset] ?? 0;
        green += data[offset + 1] ?? 0;
        blue += data[offset + 2] ?? 0;
        count += 1;
    }
    const divisor = Math.max(1, count);
    return { red: red / divisor, green: green / divisor, blue: blue / divisor };
}

function correction(channel: number, target: number, amount: number): number {
    if (channel < 1) {
        return 1;
    }
    const desired = clamp(target / channel, 0.9, 1.1);
    return 1 + (desired - 1) * amount;
}

function mapLuminance(params: {
    y: number;
    local: number;
    strength: number;
    adaptation: number;
    emphasis: number;
    suppression: number;
}): number {
    const y = clamp(params.y, 0, 1);
    const local = clamp(params.local, 0, 1);
    const adaptationAmount = params.adaptation * params.strength;
    const gamma = Math.exp((local - 0.5) * 1.2);
    const adapted = y + (Math.pow(Math.max(0.0001, y), gamma) - y) * adaptationAmount;
    const detail = y - local;
    const detailAmount = (0.16 * params.adaptation + 0.38 * params.emphasis - 0.58 * params.suppression) * params.strength;
    let mapped = adapted + detail * detailAmount;
    mapped += (local - mapped) * params.suppression * params.strength * 0.22;
    return clamp(mapped, 0, 1);
}

function applyChroma(params: {
    red: number;
    green: number;
    blue: number;
    mappedLuma: number;
    originalLuma: number;
    strength: number;
    emphasis: number;
    suppression: number;
}): [number, number, number] {
    const scale = clamp(params.mappedLuma / Math.max(0.025, params.originalLuma), 0.55, 1.8);
    let red = params.red * scale;
    let green = params.green * scale;
    let blue = params.blue * scale;
    const neutral = params.mappedLuma * 255;
    const saturation = clamp(1 + (0.12 * params.emphasis - 0.38 * params.suppression) * params.strength, 0.45, 1.2);
    red = neutral + (red - neutral) * saturation;
    green = neutral + (green - neutral) * saturation;
    blue = neutral + (blue - neutral) * saturation;
    return [clamp(red, 0, 255), clamp(green, 0, 255), clamp(blue, 0, 255)];
}

function perceptionSettings(operation: PhotoEditOperation): PerceptionSettings {
    const strength = clamp(operationValue(operation, 'strength') / 100, 0, 1);
    return {
        strength,
        adaptation: clamp(operationValue(operation, 'localAdaptation') / 100, 0, 1),
        emphasis: clamp(operationValue(operation, 'emphasis') / 100, 0, 1),
        suppression: clamp(operationValue(operation, 'suppression') / 100, 0, 1),
        colourConstancy: clamp(operationValue(operation, 'colourConstancy') / 100, 0, 1) * strength,
    };
}

async function blurredLuminance(input: Buffer, width: number, height: number): Promise<{ data: Buffer; channels: number }> {
    const sigma = clamp(Math.min(width, height) * 0.02, 1, 24);
    const local = await sharp(input)
        .removeAlpha()
        .greyscale()
        .blur(sigma)
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data: local.data, channels: local.info.channels };
}

function channelCorrections(data: Buffer, colourConstancy: number): ChannelCorrections {
    const means = channelMeans(data);
    const target = (means.red + means.green + means.blue) / 3;
    return {
        red: correction(means.red, target, colourConstancy),
        green: correction(means.green, target, colourConstancy),
        blue: correction(means.blue, target, colourConstancy),
    };
}

function copyTransparentPixel(source: Buffer, output: Buffer, offset: number, alpha: number): void {
    output[offset] = source[offset] ?? 0;
    output[offset + 1] = source[offset + 1] ?? 0;
    output[offset + 2] = source[offset + 2] ?? 0;
    output[offset + 3] = alpha;
}

function renderOpaquePixel(params: {
    source: Buffer;
    output: Buffer;
    local: Buffer;
    localChannels: number;
    pixel: number;
    offset: number;
    alpha: number;
    corrections: ChannelCorrections;
    settings: PerceptionSettings;
}): void {
    const red = (params.source[params.offset] ?? 0) * params.corrections.red;
    const green = (params.source[params.offset + 1] ?? 0) * params.corrections.green;
    const blue = (params.source[params.offset + 2] ?? 0) * params.corrections.blue;
    const originalLuma = luma(red, green, blue) / 255;
    const localLuma = (params.local[params.pixel * params.localChannels] ?? 0) / 255;
    const mappedLuma = mapLuminance({
        y: originalLuma,
        local: localLuma,
        strength: params.settings.strength,
        adaptation: params.settings.adaptation,
        emphasis: params.settings.emphasis,
        suppression: params.settings.suppression,
    });
    const [mappedRed, mappedGreen, mappedBlue] = applyChroma({
        red,
        green,
        blue,
        mappedLuma,
        originalLuma,
        strength: params.settings.strength,
        emphasis: params.settings.emphasis,
        suppression: params.settings.suppression,
    });
    params.output[params.offset] = Math.round(mappedRed);
    params.output[params.offset + 1] = Math.round(mappedGreen);
    params.output[params.offset + 2] = Math.round(mappedBlue);
    params.output[params.offset + 3] = params.alpha;
}

export async function renderPerception(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> {
    const image = await decodeRgba(input);
    const settings = perceptionSettings(operation);
    if (settings.strength <= 0) {
        return input;
    }
    const local = await blurredLuminance(input, image.width, image.height);
    const corrections = channelCorrections(image.data, settings.colourConstancy);
    const output = Buffer.alloc(image.data.length);

    for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
        const offset = pixel * 4;
        const alpha = image.data[offset + 3] ?? 255;
        if (alpha === 0) {
            copyTransparentPixel(image.data, output, offset, alpha);
            continue;
        }
        renderOpaquePixel({
            source: image.data,
            output,
            local: local.data,
            localChannels: local.channels,
            pixel,
            offset,
            alpha,
            corrections,
            settings,
        });
    }

    return encodeRgba({ ...image, data: output });
}
