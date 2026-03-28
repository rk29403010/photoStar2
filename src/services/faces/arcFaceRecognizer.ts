import { copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { listOnnxModelPathCandidates } from '../modelPaths';
import { getOrientedDimensions } from './faceImageGeometry';

const MODEL_FILENAME = 'w600k_r50.onnx';
const INPUT_SIZE = 112;
const PIXEL_SCALE = 128;
const PIXEL_OFFSET = 127.5;
const BOX_EXPANSION_FACTOR = 1.3;

export interface FaceEmbeddingService {
    isAvailable(): boolean;
    getModelPath(): string | null;
    computeEmbedding(imagePath: string, box: number[]): Promise<number[] | null>;
}

type CropRegion = {
    left: number;
    top: number;
    width: number;
    height: number;
};

function findAvailableModelPath(execPath?: string): string | null {
    const candidates = listOnnxModelPathCandidates({
        modelFileName: MODEL_FILENAME,
        moduleDir: __dirname,
        execPath,
    });
    return candidates.find((candidatePath) => existsSync(candidatePath)) ?? null;
}

function resolveUsableModelPath(modelPath: string): string {
    if (!modelPath.includes('snapshot')) {
        return modelPath;
    }

    const tempPath = join(tmpdir(), MODEL_FILENAME);
    if (!existsSync(tempPath)) {
        copyFileSync(modelPath, tempPath);
    }
    return tempPath;
}

function clampCropRegion(
    box: number[],
    imageWidth: number,
    imageHeight: number,
): CropRegion | null {
    if (box.length < 4 || imageWidth <= 0 || imageHeight <= 0) {
        return null;
    }

    let x1 = box[0] * imageWidth;
    let y1 = box[1] * imageHeight;
    const x2 = box[2] * imageWidth;
    const y2 = box[3] * imageHeight;

    let width = x2 - x1;
    let height = y2 - y1;
    if (width <= 0 || height <= 0) {
        return null;
    }

    const centerX = x1 + (width / 2);
    const centerY = y1 + (height / 2);
    const size = Math.max(width, height) * BOX_EXPANSION_FACTOR;

    x1 = Math.max(0, centerX - (size / 2));
    y1 = Math.max(0, centerY - (size / 2));
    width = Math.min(size, imageWidth - x1);
    height = Math.min(size, imageHeight - y1);

    const crop = {
        left: Math.round(x1),
        top: Math.round(y1),
        width: Math.round(width),
        height: Math.round(height),
    };

    return crop.width > 0 && crop.height > 0 ? crop : null;
}

function buildInputTensor(buffer: Buffer): ort.Tensor {
    const float32Data = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
    const planeSize = INPUT_SIZE * INPUT_SIZE;
    for (let index = 0; index < planeSize; index += 1) {
        float32Data[index] = (buffer[index * 3] - PIXEL_OFFSET) / PIXEL_SCALE;
        float32Data[index + planeSize] = (buffer[index * 3 + 1] - PIXEL_OFFSET) / PIXEL_SCALE;
        float32Data[index + (2 * planeSize)] = (buffer[index * 3 + 2] - PIXEL_OFFSET) / PIXEL_SCALE;
    }
    return new ort.Tensor('float32', float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

function getOutputTensor(results: Record<string, ort.Tensor>): Float32Array | null {
    const outputKey = Object.keys(results)[0];
    if (!outputKey) {
        return null;
    }

    const output = results[outputKey]?.data;
    return output instanceof Float32Array ? output : Float32Array.from(output as Iterable<number>);
}

export class ArcFaceRecognizer implements FaceEmbeddingService {
    private readonly modelPath: string | null;
    private session: ort.InferenceSession | null = null;

    public constructor(options?: { execPath?: string }) {
        this.modelPath = findAvailableModelPath(options?.execPath);
    }

    public isAvailable(): boolean {
        return this.modelPath !== null;
    }

    public getModelPath(): string | null {
        return this.modelPath;
    }

    public async computeEmbedding(imagePath: string, box: number[]): Promise<number[] | null> {
        if (!this.modelPath) {
            throw new Error('ArcFace model not found. Run tooling/scripts/core/download_arcface_model.cjs to install w600k_r50.onnx.');
        }

        if (!this.session) {
            this.session = await ort.InferenceSession.create(resolveUsableModelPath(this.modelPath), { logSeverityLevel: 3 });
        }

        const image = sharp(imagePath);
        const metadata = await image.metadata();
        const orientedDimensions = getOrientedDimensions(metadata);
        const cropRegion = clampCropRegion(box, orientedDimensions?.width ?? 0, orientedDimensions?.height ?? 0);
        if (!cropRegion) {
            return null;
        }

        const buffer = await image
            .rotate()
            .extract(cropRegion)
            .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
            .removeAlpha()
            .raw()
            .toBuffer();

        const tensor = buildInputTensor(buffer);
        const results = await this.session.run({ 'input.1': tensor });
        const output = getOutputTensor(results);

        return output ? Array.from(output) : null;
    }
}
