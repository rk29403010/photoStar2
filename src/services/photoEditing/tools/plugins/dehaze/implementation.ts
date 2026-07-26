import sharp from 'sharp';
import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';

type RawImage = { data: Buffer; width: number; height: number };
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
function numberValue(operation: PhotoEditOperation, key: string, fallback: number): number { const value = operation.values[key]; return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
async function decode(input: Buffer): Promise<RawImage> { const { data, info } = await sharp(input).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, width: info.width, height: info.height }; }
function encode(image: RawImage): Promise<Buffer> { return sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer(); }
function pushHorizontal(source: Float32Array, row: number, deque: Int32Array, head: number, tail: number, index: number): number {
  let nextTail = tail;
  while (nextTail > head && source[row + deque[nextTail - 1]] >= source[row + index]) { nextTail -= 1; }
  deque[nextTail] = index;
  return nextTail + 1;
}
function pushVertical(source: Float32Array, width: number, x: number, deque: Int32Array, head: number, tail: number, index: number): number {
  let nextTail = tail;
  while (nextTail > head && source[deque[nextTail - 1] * width + x] >= source[index * width + x]) { nextTail -= 1; }
  deque[nextTail] = index;
  return nextTail + 1;
}
function horizontal(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  const output = new Float32Array(source.length); const deque = new Int32Array(width);
  for (let y = 0; y < height; y += 1) { const row = y * width; let head = 0; let tail = 0; let next = 0;
    for (let x = 0; x < width; x += 1) { const right = Math.min(width - 1, x + radius);
      while (next <= right) { tail = pushHorizontal(source, row, deque, head, tail, next); next += 1; }
      const left = Math.max(0, x - radius); while (tail > head && deque[head] < left) { head += 1; }
      output[row + x] = source[row + deque[head]];
    }
  }
  return output;
}
function minimumFilter(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  const input = horizontal(source, width, height, radius); const output = new Float32Array(input.length); const deque = new Int32Array(height);
  for (let x = 0; x < width; x += 1) { let head = 0; let tail = 0; let next = 0;
    for (let y = 0; y < height; y += 1) { const bottom = Math.min(height - 1, y + radius);
      while (next <= bottom) { tail = pushVertical(input, width, x, deque, head, tail, next); next += 1; }
      const top = Math.max(0, y - radius); while (tail > head && deque[head] < top) { head += 1; }
      output[y * width + x] = input[deque[head] * width + x];
    }
  }
  return output;
}
function minimumRgb(data: Buffer, atmosphere?: readonly number[]): Float32Array { const output = new Float32Array(data.length / 4); for (let pixel = 0; pixel < output.length; pixel += 1) { const offset = pixel * 4; output[pixel] = Math.min(data[offset] / 255 / (atmosphere?.[0] ?? 1), data[offset + 1] / 255 / (atmosphere?.[1] ?? 1), data[offset + 2] / 255 / (atmosphere?.[2] ?? 1)); } return output; }
function estimateAirlight(data: Buffer, dark: Float32Array): readonly number[] { const stride = Math.max(1, Math.ceil(dark.length / 4096)); const candidates: number[] = []; for (let pixel = 0; pixel < dark.length; pixel += stride) { if (data[pixel * 4 + 3] > 0) { candidates.push(pixel); } } candidates.sort((left, right) => dark[right] - dark[left]); let brightest = candidates[0] ?? 0; let luma = -1; for (const pixel of candidates.slice(0, 32)) { const offset = pixel * 4; const candidateLuma = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]; if (candidateLuma > luma) { brightest = pixel; luma = candidateLuma; } } const offset = brightest * 4; return [Math.max(0.1, data[offset] / 255), Math.max(0.1, data[offset + 1] / 255), Math.max(0.1, data[offset + 2] / 255)]; }
function recover(image: RawImage, airlight: readonly number[], transmission: Float32Array, strength: number): Buffer { const output = Buffer.from(image.data); for (let pixel = 0; pixel < transmission.length; pixel += 1) { const offset = pixel * 4; const transmissionValue = Math.max(0.3, transmission[pixel]); for (let channel = 0; channel < 3; channel += 1) { const source = image.data[offset + channel] / 255; const recovered = (source - airlight[channel]) / transmissionValue + airlight[channel]; output[offset + channel] = Math.round(clamp(source + strength * (recovered - source), 0, 1) * 255); } } return output; }
export async function renderDehaze(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> { const strength = clamp(numberValue(operation, 'strength', 0.45), 0, 1); if (strength === 0) { return input; } const radiusPercent = clamp(numberValue(operation, 'radiusPercent', 1.5), 0.5, 3); const image = await decode(input); const radius = clamp(Math.round(Math.min(image.width, image.height) * radiusPercent / 100), 1, 63); const dark = minimumFilter(minimumRgb(image.data), image.width, image.height, radius); const airlight = estimateAirlight(image.data, dark); const normalizedDark = minimumFilter(minimumRgb(image.data, airlight), image.width, image.height, radius); const transmission = normalizedDark.map((value) => clamp(1 - 0.92 * value, 0.3, 1)); return encode({ ...image, data: recover(image, airlight, transmission, strength) }); }
