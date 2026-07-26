import sharp from 'sharp';
import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';
import { applyTuneImagePixels } from '../../../../../shared/photoEditing/tune.ts';

export async function renderAdjust(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> {
    const { data, info } = await sharp(input).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const output = Buffer.from(applyTuneImagePixels(data, operation.values));
    return sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}
