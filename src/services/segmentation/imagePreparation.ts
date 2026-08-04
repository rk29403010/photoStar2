import sharp from 'sharp';
import type { SegmentationImage } from './contracts';

/** Converts an image to the common RGB/CHW 0..1 inference representation. */
export async function prepareSegmentationImage(path: string, size = 1024): Promise<SegmentationImage> {
    const metadata = await sharp(path).rotate().metadata();
    if (!metadata.width || !metadata.height) { throw new Error(`Could not determine image dimensions for segmentation: ${path}`); }
    const scale = Math.min(size / metadata.width, size / metadata.height);
    const resizedWidth = Math.round(metadata.width * scale);
    const resizedHeight = Math.round(metadata.height * scale);
    const padX = Math.floor((size - resizedWidth) / 2);
    const padY = Math.floor((size - resizedHeight) / 2);
    const image = await sharp(path).rotate().resize(resizedWidth, resizedHeight).extend({ top: padY, bottom: size - resizedHeight - padY, left: padX, right: size - resizedWidth - padX, background: { r: 114, g: 114, b: 114, alpha: 1 } }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = new Float32Array(3 * size * size);
    for (let index = 0; index < size * size; index += 1) { pixels[index] = image.data[index * 3] / 255; pixels[index + size * size] = image.data[index * 3 + 1] / 255; pixels[index + 2 * size * size] = image.data[index * 3 + 2] / 255; }
    return { pixels, width: size, height: size, sourceWidth: metadata.width, sourceHeight: metadata.height, scale, padX, padY };
}
