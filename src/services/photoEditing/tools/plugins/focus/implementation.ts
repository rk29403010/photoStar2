import type { PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';
import { applyFocusPixels } from '../../../../../shared/photoEditing/focus.ts';
import { decodeRgba, encodeRgba } from '../../imageBuffer.ts';
export async function renderFocus(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> { const image = await decodeRgba(input); return encodeRgba({ ...image, data: Buffer.from(applyFocusPixels(image.data, image.width, image.height, operation.values)) }); }
