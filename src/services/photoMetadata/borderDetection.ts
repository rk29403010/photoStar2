import sharp from 'sharp';

export type BoundingBox = {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Detects uniform borders around an image.
 * Uses sharp().trim() to calculate the bounding box of the actual photo content.
 * Returns null if the calculated trim is less than 2% of the image size (indicating no simple border exists).
 * Ensures error handling doesn't crash the pipeline if the image is corrupted.
 */
export async function detectSimpleBorder(imagePath: string): Promise<BoundingBox | null> {
    try {
        const image = sharp(imagePath);
        const metadata = await image.metadata();

        if (!metadata.width || !metadata.height) {
            return null;
        }

        const { info } = await image
            .trim()
            .toBuffer({ resolveWithObject: true });

        if (!info || typeof info.trimOffsetLeft !== 'number' || typeof info.trimOffsetTop !== 'number') {
            return null;
        }

        const originalArea = metadata.width * metadata.height;
        const trimmedArea = info.width * info.height;
        const trimmedAwayArea = originalArea - trimmedArea;

        // Return null if the calculated trim is less than 2% of the image size
        if (trimmedAwayArea / originalArea < 0.02) {
            return null;
        }

        const left = Math.abs(info.trimOffsetLeft);
        const top = Math.abs(info.trimOffsetTop);

        return {
            x: left / metadata.width,
            y: top / metadata.height,
            width: info.width / metadata.width,
            height: info.height / metadata.height,
        };
    } catch (error) {
        console.error(`Error detecting simple border for ${imagePath}:`, error);
        return null;
    }
}
