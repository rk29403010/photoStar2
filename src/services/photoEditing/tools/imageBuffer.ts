import sharp from 'sharp';

export type RgbaImage = { data: Buffer; width: number; height: number };
export async function decodeRgba(input: Buffer): Promise<RgbaImage> { const { data, info } = await sharp(input).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, width: info.width, height: info.height }; }
export function encodeRgba(image: RgbaImage): Promise<Buffer> { return sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer(); }
