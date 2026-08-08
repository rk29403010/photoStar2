import sharp from 'sharp';
import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';
import { decodeRgba, encodeRgba, type RgbaImage } from '../../imageBuffer.ts';
import {
    detectPeriodicTexture,
    type PeriodicTextureDetection,
    type PeriodicTextureDetectionOptions,
} from '../../../imageAnalysis/periodicTexture/detection.ts';
import { fft2dInPlace, nextPowerOfTwo } from '../../../imageAnalysis/periodicTexture/fft.ts';

type PeriodRange = { minPeriodPx: number; maxPeriodPx: number };
type FilterOptions = { strength: number; notchWidthFraction: number };
type FftCanvas = { width: number; height: number; offsetX: number; offsetY: number };

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
function numberValue(operation: PhotoEditOperation, key: string, fallback: number): number { const value = operation.values[key]; return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function booleanValue(operation: PhotoEditOperation, key: string, fallback: boolean): boolean { const value = operation.values[key]; return typeof value === 'boolean' ? value : fallback; }
function periodRange(operation: PhotoEditOperation): PeriodRange {
    const first = clamp(numberValue(operation, 'minPeriodPx', 6), 2, 80); const second = clamp(numberValue(operation, 'maxPeriodPx', 40), 3, 160);
    if (first < second) { return { minPeriodPx: first, maxPeriodPx: second }; }
    if (second < first) { return { minPeriodPx: second, maxPeriodPx: first }; }
    return { minPeriodPx: first, maxPeriodPx: first + 1 };
}
function reflectIndex(index: number, length: number): number { if (length <= 1) { return 0; } const period = 2 * length - 2; const wrapped = ((index % period) + period) % period; return wrapped < length ? wrapped : period - wrapped; }
function fftCanvas(width: number, height: number): FftCanvas {
    const fftWidth = nextPowerOfTwo(width); const fftHeight = nextPowerOfTwo(height);
    return { width: fftWidth, height: fftHeight, offsetX: Math.floor((fftWidth - width) / 2), offsetY: Math.floor((fftHeight - height) / 2) };
}
function frequencyAt(index: number, length: number): number { return index < length / 2 ? index / length : (index - length) / length; }
function frequencyIndex(frequency: number, length: number): number { const positive = frequency >= 0 ? frequency : 1 + frequency; return Math.round(positive * length) % length; }
function wrappedFrequencyDistance(left: number, right: number): number { const distance = Math.abs(left - right); return Math.min(distance, 1 - distance); }
function applyNotch(mask: Float32Array, canvas: FftCanvas, fx: number, fy: number, sigma: number, strength: number): void {
    const extent = 6; const radiusX = Math.ceil(extent * sigma * canvas.width); const radiusY = Math.ceil(extent * sigma * canvas.height); const centreX = frequencyIndex(fx, canvas.width); const centreY = frequencyIndex(fy, canvas.height); const cutoffSquared = (extent * sigma) ** 2;
    for (let yDelta = -radiusY; yDelta <= radiusY; yDelta += 1) { const y = (centreY + yDelta + canvas.height) % canvas.height; const dy = wrappedFrequencyDistance(frequencyAt(y, canvas.height), fy);
        for (let xDelta = -radiusX; xDelta <= radiusX; xDelta += 1) { const x = (centreX + xDelta + canvas.width) % canvas.width; const dx = wrappedFrequencyDistance(frequencyAt(x, canvas.width), fx); const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared <= cutoffSquared) { mask[y * canvas.width + x] *= 1 - strength * Math.exp(-distanceSquared / (2 * sigma * sigma)); }
        }
    }
}
function notchMask(canvas: FftCanvas, detection: PeriodicTextureDetection, options: FilterOptions): Float32Array {
    const mask = new Float32Array(canvas.width * canvas.height); mask.fill(1);
    const fallbackFrequency = Math.min(...detection.peaks.map((peak) => Math.hypot(peak.fx, peak.fy)));
    const fundamentalFrequency = detection.fundamentalPeriodPx ? 1 / detection.fundamentalPeriodPx : fallbackFrequency;
    const sigma = Math.max(1.25 / detection.tileSize, options.notchWidthFraction * fundamentalFrequency);
    for (const peak of detection.peaks) { applyNotch(mask, canvas, peak.fx, peak.fy, sigma, options.strength); applyNotch(mask, canvas, -peak.fx, -peak.fy, sigma, options.strength); }
    return mask;
}
function imageLuminance(image: RgbaImage): Float32Array {
    const output = new Float32Array(image.width * image.height);
    for (let pixel = 0; pixel < output.length; pixel += 1) { const offset = pixel * 4; output[pixel] = (image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722) / 255; }
    return output;
}
function reflectedPlane(source: Float32Array, sourceWidth: number, sourceHeight: number, canvas: FftCanvas): Float32Array {
    const output = new Float32Array(canvas.width * canvas.height); const xSource = new Int32Array(canvas.width); const ySource = new Int32Array(canvas.height);
    for (let x = 0; x < canvas.width; x += 1) { xSource[x] = reflectIndex(x - canvas.offsetX, sourceWidth); }
    for (let y = 0; y < canvas.height; y += 1) { ySource[y] = reflectIndex(y - canvas.offsetY, sourceHeight); }
    for (let y = 0; y < canvas.height; y += 1) { const sourceRow = ySource[y] * sourceWidth; const outputRow = y * canvas.width; for (let x = 0; x < canvas.width; x += 1) { output[outputRow + x] = source[sourceRow + xSource[x]]; } }
    return output;
}
function filterLuminance(image: RgbaImage, detection: PeriodicTextureDetection, options: FilterOptions): Float32Array {
    const canvas = fftCanvas(image.width, image.height); const original = imageLuminance(image); const real = reflectedPlane(original, image.width, image.height, canvas); const imaginary = new Float32Array(real.length); const mask = notchMask(canvas, detection, options);
    fft2dInPlace(real, imaginary, canvas.width, canvas.height); for (let index = 0; index < real.length; index += 1) { real[index] *= mask[index]; imaginary[index] *= mask[index]; } fft2dInPlace(real, imaginary, canvas.width, canvas.height, true);
    const filtered = new Float32Array(original.length); for (let y = 0; y < image.height; y += 1) { const sourceRow = (y + canvas.offsetY) * canvas.width + canvas.offsetX; filtered.set(real.subarray(sourceRow, sourceRow + image.width), y * image.width); } return filtered;
}
function applyLuminanceDelta(image: RgbaImage, filteredLuminance: Float32Array): Buffer {
    const originalLuminance = imageLuminance(image); const output = Buffer.from(image.data);
    for (let pixel = 0; pixel < filteredLuminance.length; pixel += 1) { const delta = filteredLuminance[pixel] - originalLuminance[pixel]; const offset = pixel * 4; for (let channel = 0; channel < 3; channel += 1) { output[offset + channel] = Math.round(clamp(image.data[offset + channel] / 255 + delta, 0, 1) * 255); } } return output;
}
async function sharpen(image: RgbaImage, amount: number): Promise<Buffer> {
    if (amount <= 0) { return Buffer.from(image.data); }
    const rgb = Buffer.allocUnsafe(image.width * image.height * 3); for (let pixel = 0; pixel < image.width * image.height; pixel += 1) { const rgbaOffset = pixel * 4; const rgbOffset = pixel * 3; rgb[rgbOffset] = image.data[rgbaOffset]; rgb[rgbOffset + 1] = image.data[rgbaOffset + 1]; rgb[rgbOffset + 2] = image.data[rgbaOffset + 2]; }
    const blurred = await sharp(rgb, { raw: { width: image.width, height: image.height, channels: 3 } }).blur(1).raw().toBuffer(); const output = Buffer.from(image.data);
    for (let pixel = 0; pixel < image.width * image.height; pixel += 1) { const rgbaOffset = pixel * 4; const rgbOffset = pixel * 3; for (let channel = 0; channel < 3; channel += 1) { const source = image.data[rgbaOffset + channel]; output[rgbaOffset + channel] = Math.round(clamp(source + amount * (source - blurred[rgbOffset + channel]), 0, 255)); } } return output;
}

export async function detectDescreenTexture(input: Buffer, options: PeriodicTextureDetectionOptions = {}): Promise<PeriodicTextureDetection> { return detectPeriodicTexture(await decodeRgba(input), options); }
export async function renderDescreen(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> {
    const strength = clamp(numberValue(operation, 'strength', 0.98), 0, 1); if (strength === 0) { return input; }
    const periods = periodRange(operation); const image = await decodeRgba(input); const detection = detectPeriodicTexture(image, periods); const force = booleanValue(operation, 'force', false);
    if (detection.peaks.length === 0 || (!detection.likely && !force)) { return input; }
    const notchWidthFraction = clamp(numberValue(operation, 'notchWidthFraction', 0.04), 0.01, 0.1); const filtered = filterLuminance(image, detection, { strength, notchWidthFraction }); const corrected = applyLuminanceDelta(image, filtered); const sharpenAmount = clamp(numberValue(operation, 'sharpenAmount', 0.2), 0, 0.8); const sharpened = await sharpen({ ...image, data: corrected }, sharpenAmount); return encodeRgba({ ...image, data: sharpened });
}
