import sharp from 'sharp';
import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
function sigma(operation: PhotoEditOperation): number { const value = operation.values.sigma; return clamp(typeof value === 'number' && Number.isFinite(value) ? value : 1, 0.01, 10); }
export function renderSharpen(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> { return sharp(input).sharpen({ sigma: sigma(operation) }).png().toBuffer(); }
