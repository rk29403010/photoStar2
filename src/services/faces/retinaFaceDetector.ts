import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { resolveOnnxModelPath } from '../modelPaths';
import {
    getOrientedDimensions,
} from './faceImageGeometry';
import { suppressDuplicateFaceCandidates } from './faceDetectionSuppression';
import { createScrfdAnchorCenters, decodeScrfdCandidates } from './scrfdDecode';

const MODEL_FILENAME = 'det_10g.onnx';
const INPUT_WIDTH = 640;
const INPUT_HEIGHT = 640;
const STEPS = [8, 16, 32] as const;
const ANCHOR_COUNT = 2;
const SCORE_OUTPUT_NAMES = ['448', '471', '494'] as const;
const BOX_OUTPUT_NAMES = ['451', '474', '497'] as const;
const LANDMARK_OUTPUT_NAMES = ['454', '477', '500'] as const;
const MODEL_PATH = resolveOnnxModelPath({
    modelFileName: MODEL_FILENAME,
    moduleDir: __dirname,
});

export type FaceDetectionCandidate = {
    score: number;
    box: [number, number, number, number];
    landmarks: Array<{ x: number; y: number }>;
}

function clampUnit(value: number): number {
    return Math.max(0, Math.min(1, value));
}

export class RetinaFaceDetector {
    private session: ort.InferenceSession | null = null;
    private anchorCentersByStride = new Map<number, Array<[number, number]>>();

    public async detect(imagePath: string): Promise<FaceDetectionCandidate[]> {
        if (!this.session) {
            await this.init();
        }

        const image = sharp(imagePath);
        const metadata = await image.metadata();
        const orientedDimensions = getOrientedDimensions(metadata);
        if (!orientedDimensions) {
            return [];
        }

        const resizedImage = await image
            .rotate()
            .resize(INPUT_WIDTH, INPUT_HEIGHT, {
                fit: 'inside',
            })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const detScale = resizedImage.info.width / orientedDimensions.width;
        const buffer = Buffer.alloc(INPUT_WIDTH * INPUT_HEIGHT * 3, 0);
        for (let row = 0; row < resizedImage.info.height; row += 1) {
            const sourceOffset = row * resizedImage.info.width * 3;
            const destinationOffset = row * INPUT_WIDTH * 3;
            resizedImage.data.copy(
                buffer,
                destinationOffset,
                sourceOffset,
                sourceOffset + (resizedImage.info.width * 3),
            );
        }

        const float32Data = new Float32Array(3 * INPUT_HEIGHT * INPUT_WIDTH);
        for (let index = 0; index < INPUT_HEIGHT * INPUT_WIDTH; index += 1) {
            float32Data[index] = (buffer[index * 3] - 127.5) / 128.0;
            float32Data[index + INPUT_HEIGHT * INPUT_WIDTH] = (buffer[index * 3 + 1] - 127.5) / 128.0;
            float32Data[index + 2 * INPUT_HEIGHT * INPUT_WIDTH] = (buffer[index * 3 + 2] - 127.5) / 128.0;
        }

        const tensor = new ort.Tensor('float32', float32Data, [1, 3, INPUT_HEIGHT, INPUT_WIDTH]);
        const results = await this.session!.run({ 'input.1': tensor });
        return this.postProcess(results, orientedDimensions.width, orientedDimensions.height, detScale);
    }

    private async init(): Promise<void> {
        if (this.session) {
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

        this.session = await ort.InferenceSession.create(usableModelPath, { logSeverityLevel: 3 });
    }

    private postProcess(
        results: Record<string, ort.Tensor>,
        imageWidth: number,
        imageHeight: number,
        detScale: number,
    ): FaceDetectionCandidate[] {
        try {
            const candidates = STEPS.flatMap((step, index) => decodeScrfdCandidates({
                scores: results[SCORE_OUTPUT_NAMES[index]].data as Float32Array,
                boxPredictions: results[BOX_OUTPUT_NAMES[index]].data as Float32Array,
                landmarkPredictions: results[LANDMARK_OUTPUT_NAMES[index]].data as Float32Array,
                anchorCenters: this.getAnchorCenters(step),
                stride: step,
                imageWidth,
                imageHeight,
                detScale,
                scoreThreshold: 0.5,
            }));

            return suppressDuplicateFaceCandidates(candidates.map((candidate) => ({
                score: candidate.score,
                box: [
                    clampUnit(candidate.box[0]),
                    clampUnit(candidate.box[1]),
                    clampUnit(candidate.box[2]),
                    clampUnit(candidate.box[3]),
                ] as [number, number, number, number],
                landmarks: candidate.landmarks.map((landmark) => ({
                    x: clampUnit(landmark.x),
                    y: clampUnit(landmark.y),
                })),
            })));
        } catch {
            return [];
        }
    }

    private getAnchorCenters(stride: typeof STEPS[number]): Array<[number, number]> {
        const cached = this.anchorCentersByStride.get(stride);
        if (cached) {
            return cached;
        }

        const centers = createScrfdAnchorCenters({
            featureWidth: INPUT_WIDTH / stride,
            featureHeight: INPUT_HEIGHT / stride,
            stride,
            anchorCount: ANCHOR_COUNT,
        });
        this.anchorCentersByStride.set(stride, centers);
        return centers;
    }
}
