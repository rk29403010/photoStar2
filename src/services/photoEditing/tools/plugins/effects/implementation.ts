import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';
import { applyPhotoEffectPixels } from '../../../../../shared/photoEditing/effects.ts';
import { decodeRgba, encodeRgba } from '../../imageBuffer.ts';
export async function renderEffects(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> { const image = await decodeRgba(input); return encodeRgba({ ...image, data: Buffer.from(applyPhotoEffectPixels(image.data, image.width, image.height, operation.values)) }); }
