import sharp from 'sharp';
import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';
import { decodeRgba, encodeRgba } from '../../imageBuffer.ts';
import { PERCEPTION_DEFAULTS } from './defaults.ts';

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function value(operation: PhotoEditOperation, key: string): number {
    const candidate = operation.values[key];
    const fallback = PERCEPTION_DEFAULTS[key];
    return typeof candidate === 'number' && Number.isFinite(candidate)
        ? candidate
        : typeof fallback === 'number' ? fallback : 0;
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

export async function renderPerception(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> {
    const image = await decodeRgba(input);
    const strength = clamp(value(operation, 'strength') / 100, 0, 1);
    if (strength <= 0) {
        return input;
    }
    const adaptation = clamp(value(operation, 'localAdaptation') / 100, 0, 1);
    const emphasis = clamp(value(operation, 'emphasis') / 100, 0, 1);
    const suppression = clamp(value(operation, 'suppression') / 100, 0, 1);
    const colourConstancy = clamp(value(operation, 'colourConstancy') / 100, 0, 1) * strength;
    const sigma = clamp(Math.min(image.width, image.height) * 0.02, 1, 24);
    const local = await sharp(input)
        .removeAlpha()
        .greyscale()
        .blur(sigma)
        .raw()
        .toBuffer({ resolveWithObject: true });
    const means = channelMeans(image.data);
    const target = (means.red + means.green + means.blue) / 3;
    const redCorrection = correction(means.red, target, colourConstancy);
    const greenCorrection = correction(means.green, target, colourConstancy);
    const blueCorrection = correction(means.blue, target, colourConstancy);
    const output = Buffer.alloc(image.data.length);
    const channels = local.info.channels;

    for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
        const offset = pixel * 4;
        const alpha = image.data[offset + 3] ?? 255;
        if (alpha === 0) {
            output[offset] = image.data[offset] ?? 0;
            output[offset + 1] = image.data[offset + 1] ?? 0;
            output[offset + 2] = image.data[offset + 2] ?? 0;
            output[offset + 3] = alpha;
            continue;
        }
        const red = (image.data[offset] ?? 0) * redCorrection;
        const green = (image.data[offset + 1] ?? 0) * greenCorrection;
        const blue = (image.data[offset + 2] ?? 0) * blueCorrection;
        const originalLuma = luma(red, green, blue) / 255;
        const localLuma = (local.data[pixel * channels] ?? 0) / 255;
        const mappedLuma = mapLuminance({ y: originalLuma, local: localLuma, strength, adaptation, emphasis, suppression });
        const [mappedRed, mappedGreen, mappedBlue] = applyChroma({ red, green, blue, mappedLuma, originalLuma, strength, emphasis, suppression });
        output[offset] = Math.round(mappedRed);
        output[offset + 1] = Math.round(mappedGreen);
        output[offset + 2] = Math.round(mappedBlue);
        output[offset + 3] = alpha;
    }

    return encodeRgba({ ...image, data: output });
}
