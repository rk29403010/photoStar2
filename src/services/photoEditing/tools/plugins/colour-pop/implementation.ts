import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';
import { applyColourPopPixels } from '../../../../../shared/photoEditing/colourPop.ts';
import { decodeRgba, encodeRgba } from '../../imageBuffer.ts';
export async function renderColourPop(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> { const image = await decodeRgba(input); return encodeRgba({ ...image, data: Buffer.from(applyColourPopPixels(image.data, operation.values)) }); }
