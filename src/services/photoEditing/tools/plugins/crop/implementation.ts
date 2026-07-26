import sharp from 'sharp';
import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
function numberValue(operation: PhotoEditOperation, key: string, fallback: number): number { const value = operation.values[key]; return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }

export async function renderCrop(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> {
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) { return input; }
    const left = Math.round(clamp(numberValue(operation, 'x', 0), 0, 0.99) * metadata.width);
    const top = Math.round(clamp(numberValue(operation, 'y', 0), 0, 0.99) * metadata.height);
    const width = Math.max(1, Math.min(Math.round(clamp(numberValue(operation, 'width', 1), 0.01, 1) * metadata.width), metadata.width - left));
    const height = Math.max(1, Math.min(Math.round(clamp(numberValue(operation, 'height', 1), 0.01, 1) * metadata.height), metadata.height - top));
    return sharp(input).extract({ left, top, width, height }).png().toBuffer();
}
