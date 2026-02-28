import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import sharp from 'sharp';

export async function hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const input = createReadStream(filePath);
        input.on('error', reject);
        input.on('data', chunk => hash.update(chunk));
        input.on('end', () => resolve(hash.digest('hex')));
    });
}

export function getFileStats(filePath: string) {
    return statSync(filePath);
}

export async function getExifData(filePath: string) {
    try {
        const metadata = await sharp(filePath).metadata();
        const isRotated = metadata.orientation && metadata.orientation >= 5;
        return {
            width: isRotated ? metadata.height : metadata.width,
            height: isRotated ? metadata.width : metadata.height,
            exif: metadata.exif // Raw buffer, strictly we might want to parse this, but sharp provides some parsed fields too
        };
    } catch (e) {
        return null;
    }
}
