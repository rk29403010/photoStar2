import sharp from 'sharp';
import fs from 'node:fs/promises';

const imagePath = 'C:\\Users\\robin\\Pictures\\Family History\\Family History - Croot-Sheldrake\\221421-082918_05.jpg';

async function run() {
    const fileBuffer = await fs.readFile(imagePath);
    const oriented = sharp(fileBuffer).rotate();
    const metadata = await oriented.metadata();
    
    const overviewBuffer = await sharp(await oriented.toBuffer())
        .rotate()
        .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
        
    await fs.writeFile('scratch/overview.jpg', overviewBuffer);
    const overviewMetadata = await sharp(overviewBuffer).metadata();
    console.log('Overview size:', {
        width: overviewMetadata.width,
        height: overviewMetadata.height
    });
}

run().catch(console.error);
