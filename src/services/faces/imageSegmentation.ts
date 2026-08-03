import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as ort from 'onnxruntime-node';
import { resolveOnnxModelPath } from '../modelPaths';

const MODEL_FILENAME = 'fastsam-int8.onnx';

const MODEL_PATH = resolveOnnxModelPath({
    modelFileName: MODEL_FILENAME,
    moduleDir: __dirname,
});

export type MaskArray = Uint8Array; // 1 for foreground/photo content, 0 for background/frame

let session: ort.InferenceSession | null = null;

/**
 * Initializes and loads the fastsam-int8.onnx model.
 */
export async function initImageSegmentation(): Promise<void> {
    if (session) {
        return;
    }

    let usableModelPath = MODEL_PATH;
    if (MODEL_PATH.includes('snapshot')) {
        const tempPath = join(tmpdir(), MODEL_FILENAME);
        if (!existsSync(tempPath)) {
            mkdirSync(dirname(tempPath), { recursive: true });
            copyFileSync(MODEL_PATH, tempPath);
        }
        usableModelPath = tempPath;
    }

    session = await ort.InferenceSession.create(usableModelPath, { logSeverityLevel: 3 });
}

/**
 * Segments the core photo content from a potentially non-rectangular frame.
 * Programmatically generates a positive point prompt at the center of the image
 * (width/2, height/2) to target the photo content.
 * 
 * @param imageBuffer Preprocessed Float32Array image data in CHW format
 * @param width Input image width
 * @param height Input image height
 * @returns A promise resolving to a MaskArray (Uint8Array) of size width * height
 */
export async function segmentPhotoFromFrame(
    imageBuffer: Float32Array,
    width: number,
    height: number,
    prompt?: { x: number; y: number },
): Promise<MaskArray> {
    if (!session) {
        await initImageSegmentation();
    }

    if (!session) {
        throw new Error('Failed to initialize ONNX session for image segmentation.');
    }

    // Programmatically generate a 'positive point prompt' at the center of the photo
    const centerX = (prompt?.x ?? 0.5) * width;
    const centerY = (prompt?.y ?? 0.5) * height;

    // FastSAM/SAM expects coordinates of prompt points in [batch, num_points, 2] shape
    const pointCoordsData = new Float32Array([centerX, centerY]);
    // Labels corresponding to point prompts (1 = positive point prompt) in [batch, num_points] shape
    const pointLabelsData = new Float32Array([1]);

    const imageTensor = new ort.Tensor('float32', imageBuffer, [1, 3, height, width]);
    const coordsTensor = new ort.Tensor('float32', pointCoordsData, [1, 1, 2]);
    const labelsTensor = new ort.Tensor('float32', pointLabelsData, [1, 1]);

    const feeds: Record<string, ort.Tensor> = {
        'images': imageTensor,
        'point_coords': coordsTensor,
        'point_labels': labelsTensor,
    };

    const results = await session.run(feeds);

    // Identify output mask tensor
    const outputKey = Object.keys(results).find(key => key.includes('mask') || key.includes('output')) || Object.keys(results)[0];
    const outputTensor = results[outputKey];

    if (!outputTensor) {
        throw new Error('No output segmentation mask tensor found in results.');
    }

    const outputData = outputTensor.data as Float32Array | Int32Array | Uint8Array;
    const maskLength = width * height;
    const mask = new Uint8Array(maskLength);

    // Convert output segmentation mask into binary MaskArray
    for (let i = 0; i < maskLength; i++) {
        mask[i] = outputData[i] > 0 ? 1 : 0;
    }

    return mask;
}
