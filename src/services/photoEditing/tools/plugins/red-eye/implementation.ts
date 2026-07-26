import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';
import { applyRedEyePixels } from '../../../../../shared/photoEditing/redEye.ts';
import { decodeRgba, encodeRgba } from '../../imageBuffer.ts';
export async function renderRedEye(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> { const image = await decodeRgba(input); return encodeRgba({ ...image, data: Buffer.from(applyRedEyePixels(image.data, image.width, image.height, operation.values)) }); }
