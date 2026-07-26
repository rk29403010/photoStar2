import sharp from 'sharp';
import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
function sigma(operation: PhotoEditOperation): number { const value = operation.values.sigma; return clamp(typeof value === 'number' && Number.isFinite(value) ? value : 2, 0.3, 100); }
export function renderBlur(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> { return sharp(input).blur(sigma(operation)).png().toBuffer(); }
