import type Database from 'better-sqlite3';
import sharp from 'sharp';
import type { PhotoMaskMetadata, PhotoMaskMetadataItem } from '../../boundary/contracts/photoEditor';
import { MAX_EDITOR_MASK_DIMENSION } from '../segmentation/maskPostProcessing';

type AssetMaskMetadataInput = {
    assetId: string;
    sourceId: string;
    masks: PhotoMaskMetadataItem[];
};

export function createPhotoMaskMetadata(masks: PhotoMaskMetadataItem[]): PhotoMaskMetadata {
    return { schemaVersion: 1, masks };
}

export async function encodeMaskRaster(mask: Uint8Array, width: number, height: number): Promise<NonNullable<PhotoMaskMetadataItem['raster']>> {
    const scale = Math.min(1, MAX_EDITOR_MASK_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const pixels = Buffer.alloc(mask.length * 4);
    for (let index = 0; index < mask.length; index += 1) {
        const offset = index * 4;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = mask[index] === 0 ? 0 : 255;
    }
    const png = await sharp(pixels, { raw: { width, height, channels: 4 } }).resize(targetWidth, targetHeight, { kernel: 'nearest' }).png({ compressionLevel: 9 }).toBuffer();
    return { width: targetWidth, height: targetHeight, pngBase64: png.toString('base64') };
}

export function saveAssetMaskMetadata(db: Database.Database, input: AssetMaskMetadataInput): void {
    const metadata = createPhotoMaskMetadata(input.masks);
    db.prepare(`
        INSERT INTO asset_mask_metadata (asset_id, source_id, schema_version, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(asset_id, source_id) DO UPDATE SET
            schema_version = excluded.schema_version,
            data = excluded.data,
            updated_at = CURRENT_TIMESTAMP
    `).run(input.assetId, input.sourceId, metadata.schemaVersion, JSON.stringify(metadata));
}
