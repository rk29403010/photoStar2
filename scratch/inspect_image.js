import sharp from 'sharp';
import { join } from 'node:path';

const imagePath = 'C:\\Users\\robin\\Pictures\\Family History\\Family History - Croot-Sheldrake\\221421-082918_05.jpg';

async function run() {
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    console.log('Sharp Metadata:', {
        width: metadata.width,
        height: metadata.height,
        orientation: metadata.orientation
    });

    const oriented = image.rotate();
    const orientedMetadata = await oriented.metadata();
    console.log('Oriented Sharp Metadata:', {
        width: orientedMetadata.width,
        height: orientedMetadata.height,
        orientation: orientedMetadata.orientation
    });

    const buffer = await oriented.toBuffer();
    const bufferMetadata = await sharp(buffer).metadata();
    console.log('Buffer Metadata:', {
        width: bufferMetadata.width,
        height: bufferMetadata.height,
        orientation: bufferMetadata.orientation
    });
}

run().catch(console.error);
