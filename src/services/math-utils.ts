// Basic Matrix Utils for Affine Transform

export type Point = { x: number, y: number };

// Standard 5 facial landmarks for ArcFace 112x112
// [left_eye, right_eye, nose, left_mouth, right_mouth]
export const ARCFACE_DST_POINTS: Point[] = [
    { x: 38.2946, y: 51.6963 },
    { x: 73.5318, y: 51.5014 },
    { x: 56.0252, y: 71.7366 },
    { x: 41.5493, y: 92.3655 },
    { x: 70.7299, y: 92.2041 }
];

export function estimateAffine(src: Point[], dst: Point[]): number[] {
    // Least squares estimation of affine transformation
    // M * [x, y, 1] = [u, v] / [u, v, 1]

    // Simplistic approach: Umeyama or similar rigid transform is better, 
    // but for 5 points, we can use a standard least squares solver.
    // However, implementing a full linear algebra solver in vanilla JS is heavy.
    // We'll use a similarity transform approximation which is often sufficient for face alignment.

    // Calculate centroids
    const srcMean = getMean(src);
    const dstMean = getMean(dst);

    // Subtract mean
    const srcCentered = src.map(p => ({ x: p.x - srcMean.x, y: p.y - srcMean.y }));
    const dstCentered = dst.map(p => ({ x: p.x - dstMean.x, y: p.y - dstMean.y }));

    // Eq: dst = s * R * src + t
    // Denom = sum(src_x^2 + src_y^2)
    // Numerator_a = sum(src_x * dst_x + src_y * dst_y)
    // Numerator_b = sum(src_x * dst_y - src_y * dst_x)

    let denom = 0;
    let numA = 0;
    let numB = 0;

    for (let i = 0; i < src.length; i++) {
        denom += srcCentered[i].x ** 2 + srcCentered[i].y ** 2;
        numA += srcCentered[i].x * dstCentered[i].x + srcCentered[i].y * dstCentered[i].y;
        numB += srcCentered[i].x * dstCentered[i].y - srcCentered[i].y * dstCentered[i].x;
    }

    if (denom === 0) {return [1, 0, 0, 0, 1, 0];} // Identity fallback

    const a = numA / denom; // s * cos(theta)
    const b = numB / denom; // s * sin(theta)

    // Translation
    const transX = dstMean.x - (a * srcMean.x - b * srcMean.y);
    const transY = dstMean.y - (b * srcMean.x + a * srcMean.y);

    return [a, -b, transX, b, a, transY];
}

function getMean(points: Point[]) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

// Convert [a, b, tx, c, d, ty] to SVG matrix string or sharp affine string
// Sharp takes: [a, b, c, d] (2x2) + separate translate? No, sharp uses logic.
// Actually sharp.affine takes a 2x2 matrix string? Or an Array?
// Sharp ... implementation details ...

export function dotProduct(a: number[], b: number[]) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {sum += a[i] * b[i];}
    return sum;
}

export function magnitude(a: number[]) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {sum += a[i] * a[i];}
    return Math.sqrt(sum);
}

export function cosineSimilarity(a: number[], b: number[]) {
    if (a.length !== b.length) {throw new Error("Vector length mismatch");}
    return dotProduct(a, b) / (magnitude(a) * magnitude(b));
}

// Custom blockhash / perceptual hashing routines
export function blockhashData(data: Buffer | Uint8Array | number[], _bits?: number): string {
    // A simple mean-hash (aHash) based on the supplied grayscale block
    // the image should ideally be resized to bits x bits before calling this.
    // If bits is provided, it helps clarify the expected data length (bits*bits).
    const targetLength = _bits ? _bits * _bits : 64; // Default to 8x8 = 64 bits if _bits not provided
    
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum += data[i];
    }
    const mean = sum / data.length;

    let hash = 0n;
    // We iterate up to 64 bits max for a 16-char hex string, 
    // or the length of the data if it's smaller.
    const len = Math.min(data.length, targetLength, 64); // Ensure we don't exceed 64 bits for the hash
    for (let i = 0; i < len; i++) {
        if (data[i] >= mean) {
            hash |= (1n << BigInt(len - 1 - i));
        }
    }
    return hash.toString(16).padStart(16, '0');
}

export async function dhashData(data: Buffer | Uint8Array, width: number, height: number): Promise<string> {
    // dHash calculates the difference between adjacent pixels.
    // the image should ideally be resized to (bits + 1) x bits (e.g. 9x8) before calling this
    // but if it's 8x8, we just do it per row.
    let hash = 0n;
    let bitIndex = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width - 1; x++) {
            const left = data[y * width + x];
            const right = data[y * width + x + 1];
            if (left > right) {
                hash |= (1n << BigInt(63 - bitIndex));
            }
            bitIndex++;
            if (bitIndex >= 64) {break;}
        }
        if (bitIndex >= 64) {break;}
    }

    return hash.toString(16).padStart(16, '0');
}

export function hammingDistance(hash1: string, hash2: string): number {
    const b1 = BigInt(`0x${hash1}`);
    const b2 = BigInt(`0x${hash2}`);
    let xor = b1 ^ b2;
    let dist = 0;
    while (xor > 0n) {
        dist += Number(xor & 1n);
        xor >>= 1n;
    }
    return dist;
}
