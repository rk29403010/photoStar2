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
        // Frame interiors use the same oriented full-photo coordinates as local faces.
        const oriented = await sharp(imagePath).rotate().png().toBuffer({ resolveWithObject: true });
        const dimensions = { width: oriented.info.width, height: oriented.info.height };

        const { info } = await sharp(oriented.data)
            .trim()
            .toBuffer({ resolveWithObject: true });

        if (!info || typeof info.trimOffsetLeft !== 'number' || typeof info.trimOffsetTop !== 'number') {
            return null;
        }

        const originalArea = dimensions.width * dimensions.height;
        const trimmedArea = info.width * info.height;
        const trimmedAwayArea = originalArea - trimmedArea;

        // Return null if the calculated trim is less than 2% of the image size
        if (trimmedAwayArea / originalArea < 0.02) {
            return null;
        }

        const left = Math.abs(info.trimOffsetLeft);
        const top = Math.abs(info.trimOffsetTop);

        return {
            x: left / dimensions.width,
            y: top / dimensions.height,
            width: info.width / dimensions.width,
            height: info.height / dimensions.height,
        };
    } catch (error) {
        console.error(`Error detecting simple border for ${imagePath}:`, error);
        return null;
    }
}
