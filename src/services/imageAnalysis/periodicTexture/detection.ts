import { fft2dInPlace } from './fft.ts';

export type RgbaImage = { data: ArrayLike<number>; width: number; height: number };
export type PeriodicTextureDetectionOptions = {
    minPeriodPx?: number; maxPeriodPx?: number; tileSize?: number; overlap?: number;
    minPeakZ?: number; minTileSupport?: number; maxPeakPairs?: number;
};
export type SpectralPeak = { fx: number; fy: number; z: number; tileSupport: number; medianPeakRatio: number; periodPx: number };
export type PeriodicTextureDetection = {
    likely: boolean; confidence: number; fundamentalPeriodPx: number | null; strongestPeakZ: number;
    meanTileSupport: number; tileSize: number; tilesUsed: number; peaks: SpectralPeak[];
};

type Candidate = { index: number; fx: number; fy: number; z: number; power: number };
type DetectionSettings = Required<PeriodicTextureDetectionOptions>;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function powerOfTwoAtMost(value: number): number { let result = 1; while (result * 2 <= value) { result *= 2; } return result; }
function median(values: number[]): number { if (values.length === 0) { return 0; } const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function robustZ(values: Float32Array): Float32Array {
    const finite = Array.from(values).filter(Number.isFinite); const centre = median(finite); const mad = median(finite.map((value) => Math.abs(value - centre))) || 1e-6; const scale = 1.4826 * mad;
    return Float32Array.from(values, (value) => (value - centre) / scale);
}
function tilePositions(length: number, tile: number, overlap: number): number[] {
    if (length <= tile) { return [0]; } const step = Math.max(1, Math.round(tile * (1 - overlap))); const positions: number[] = [];
    for (let start = 0; start <= length - tile; start += step) { positions.push(start); }
    if (positions.at(-1) !== length - tile) { positions.push(length - tile); } return positions;
}
function limitedTilePositions(length: number, tile: number, overlap: number, maximum: number): number[] {
    const positions = tilePositions(length, tile, overlap); if (positions.length <= maximum) { return positions; }
    const selected = Array.from({ length: maximum }, (_, index) => positions[Math.round(index * (positions.length - 1) / (maximum - 1))]);
    return [...new Set(selected)];
}
function lumaAt(image: RgbaImage, x: number, y: number): number {
    const offset = (y * image.width + x) * 4; return 0.2126 * (image.data[offset] ?? 0) + 0.7152 * (image.data[offset + 1] ?? 0) + 0.0722 * (image.data[offset + 2] ?? 0);
}
function windowedTile(image: RgbaImage, left: number, top: number, size: number): Float32Array {
    const output = new Float32Array(size * size); let mean = 0;
    for (let y = 0; y < size; y += 1) { for (let x = 0; x < size; x += 1) { const value = lumaAt(image, left + x, top + y); output[y * size + x] = value; mean += value; } }
    mean /= output.length;
    for (let y = 0; y < size; y += 1) { const wy = 0.5 - 0.5 * Math.cos(2 * Math.PI * y / Math.max(1, size - 1)); for (let x = 0; x < size; x += 1) { const wx = 0.5 - 0.5 * Math.cos(2 * Math.PI * x / Math.max(1, size - 1)); output[y * size + x] = (output[y * size + x] - mean) * wx * wy; } }
    return output;
}
function tilePower(image: RgbaImage, left: number, top: number, size: number): Float32Array {
    const real = windowedTile(image, left, top, size); const imaginary = new Float32Array(real.length); fft2dInPlace(real, imaginary, size, size);
    return Float32Array.from(real, (value, index) => Math.log1p(value * value + imaginary[index] * imaginary[index]));
}
function frequency(index: number, size: number): number { return index <= size / 2 ? index / size : (index - size) / size; }
function radialBaseline(power: Float32Array, size: number): Float32Array {
    const bins: number[][] = Array.from({ length: Math.ceil(Math.SQRT2 * size / 2) + 2 }, () => []);
    for (let y = 0; y < size; y += 1) { const fy = frequency(y, size); for (let x = 0; x < size; x += 1) { const fx = frequency(x, size); const bin = Math.round(Math.hypot(fx, fy) * size); bins[bin].push(power[y * size + x]); } }
    const medians = bins.map(median); return Float32Array.from(power, (value, index) => { const y = Math.floor(index / size); const x = index % size; return value - (medians[Math.round(Math.hypot(frequency(x, size), frequency(y, size)) * size)] ?? 0); });
}
function aggregate(powers: Float32Array[]): Float32Array {
    const output = new Float32Array(powers[0]?.length ?? 0); for (let index = 0; index < output.length; index += 1) { const values = powers.map((power) => power[index]); output[index] = median(values); } return output;
}
function isCanonicalHalf(fx: number, fy: number): boolean { return fy > 0 || (fy === 0 && fx > 0); }
function isCandidateFrequency(fx: number, fy: number, minFrequency: number, maxFrequency: number): boolean {
    const magnitude = Math.hypot(fx, fy);
    return magnitude >= minFrequency && magnitude <= maxFrequency && isCanonicalHalf(fx, fy);
}
function isLocalMaximum(z: Float32Array, size: number, x: number, y: number, value: number): boolean {
    for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
            if (dx !== 0 || dy !== 0) {
                const nx = (x + dx + size) % size; const ny = (y + dy + size) % size;
                if (z[ny * size + nx] > value) { return false; }
            }
        }
    }
    return true;
}
function candidates(z: Float32Array, power: Float32Array, size: number, minFrequency: number, maxFrequency: number): Candidate[] {
    const output: Candidate[] = [];
    for (let y = 0; y < size; y += 1) { const fy = frequency(y, size); for (let x = 0; x < size; x += 1) {
        const fx = frequency(x, size); const index = y * size + x; const value = z[index];
        if (isCandidateFrequency(fx, fy, minFrequency, maxFrequency) && isLocalMaximum(z, size, x, y, value)) { output.push({ index, fx, fy, z: value, power: power[index] }); }
    } }
    return output.sort((a, b) => b.z - a.z);
}
function supportFor(candidate: Candidate, powers: Float32Array[], size: number): { support: number; ratio: number } {
    const ratios = powers.map((power) => { const y = Math.floor(candidate.index / size); const x = candidate.index % size; const nearby: number[] = [];
        for (let dy = -4; dy <= 4; dy += 1) { for (let dx = -4; dx <= 4; dx += 1) { const distance = Math.hypot(dx, dy); if (distance >= 2.5 && distance <= 4.5) { nearby.push(power[((y + dy + size) % size) * size + ((x + dx + size) % size)]); } } }
        return Math.exp(power[candidate.index] - median(nearby)); });
    return { support: ratios.filter((ratio) => ratio >= 4).length / Math.max(1, ratios.length), ratio: median(ratios) };
}
function orientationCount(peaks: SpectralPeak[]): number {
    const buckets = new Set<number>(); for (const peak of peaks) { const angle = (Math.atan2(peak.fy, peak.fx) * 180 / Math.PI + 180) % 180; buckets.add(Math.round(angle / 15)); } return buckets.size;
}
function deduplicate(input: SpectralPeak[], maxCount: number): SpectralPeak[] {
    const output: SpectralPeak[] = []; for (const peak of input) { if (output.some((other) => Math.hypot(peak.fx - other.fx, peak.fy - other.fy) < 0.008)) { continue; } output.push(peak); if (output.length >= maxCount) { break; } } return output;
}
function resolveSettings(options: PeriodicTextureDetectionOptions): DetectionSettings {
    return { minPeriodPx: options.minPeriodPx ?? 6, maxPeriodPx: options.maxPeriodPx ?? 40, tileSize: options.tileSize ?? 512, overlap: options.overlap ?? 0.5, minPeakZ: options.minPeakZ ?? 10, minTileSupport: options.minTileSupport ?? 0.55, maxPeakPairs: options.maxPeakPairs ?? 12 };
}
function emptyDetection(tileSize: number): PeriodicTextureDetection {
    return { likely: false, confidence: 0, fundamentalPeriodPx: null, strongestPeakZ: 0, meanTileSupport: 0, tileSize, tilesUsed: 0, peaks: [] };
}
function collectTilePowers(image: RgbaImage, tileSize: number, overlap: number): Float32Array[] {
    const powers: Float32Array[] = []; const xs = limitedTilePositions(image.width, tileSize, overlap, 7); const ys = limitedTilePositions(image.height, tileSize, overlap, 7);
    for (const top of ys) { for (const left of xs) { powers.push(tilePower(image, left, top, tileSize)); } }
    return powers;
}
function acceptedPeaks(raw: Candidate[], powers: Float32Array[], tileSize: number, settings: DetectionSettings): SpectralPeak[] {
    const strongest = raw[0]?.z ?? 0; const adaptive = Math.max(settings.minPeakZ, strongest * 0.2); const accepted: SpectralPeak[] = [];
    for (const candidate of raw) {
        if (candidate.z < adaptive) { break; }
        const support = supportFor(candidate, powers, tileSize);
        if (support.support >= settings.minTileSupport) { const frequencyMagnitude = Math.hypot(candidate.fx, candidate.fy); accepted.push({ fx: candidate.fx, fy: candidate.fy, z: candidate.z, tileSupport: support.support, medianPeakRatio: support.ratio, periodPx: 1 / frequencyMagnitude }); }
    }
    return deduplicate(accepted, settings.maxPeakPairs);
}
function buildDetection(peaks: SpectralPeak[], strongest: number, tileSize: number, tilesUsed: number, minPeakZ: number, minTileSupport: number): PeriodicTextureDetection {
    const meanSupport = peaks.length ? peaks.reduce((sum, peak) => sum + peak.tileSupport, 0) / peaks.length : 0; const orientations = orientationCount(peaks);
    const likely = strongest >= minPeakZ && peaks.length >= 2 && orientations >= 2 && meanSupport >= minTileSupport;
    const confidence = clamp((strongest / 20) * 35 + meanSupport * 35 + Math.min(peaks.length, 6) / 6 * 20 + Math.min(orientations, 3) / 3 * 10, 0, 100);
    const fundamentalPeriodPx = peaks.length ? Math.max(...peaks.map((peak) => peak.periodPx)) : null;
    return { likely, confidence: Number(confidence.toFixed(1)), fundamentalPeriodPx, strongestPeakZ: strongest, meanTileSupport: meanSupport, tileSize, tilesUsed, peaks };
}

export function detectPeriodicTexture(image: RgbaImage, options: PeriodicTextureDetectionOptions = {}): PeriodicTextureDetection {
    const settings = resolveSettings(options); const tileSize = powerOfTwoAtMost(Math.min(settings.tileSize, image.width, image.height));
    if (tileSize < 128) { return emptyDetection(tileSize); }
    const powers = collectTilePowers(image, tileSize, settings.overlap); const whitened = radialBaseline(aggregate(powers), tileSize); const z = robustZ(whitened);
    const raw = candidates(z, whitened, tileSize, 1 / settings.maxPeriodPx, 1 / settings.minPeriodPx); const peaks = acceptedPeaks(raw, powers, tileSize, settings);
    return buildDetection(peaks, raw[0]?.z ?? 0, tileSize, powers.length, settings.minPeakZ, settings.minTileSupport);
}
