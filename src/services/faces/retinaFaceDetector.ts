import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { resolveOnnxModelPath } from '../modelPaths';
import {
    createModelToImageTransform,
    getOrientedDimensions,
    mapBoxFromModelToImage,
    mapPointFromModelToImage,
    type ModelToImageTransform,
} from './faceImageGeometry';
import { suppressDuplicateFaceCandidates } from './faceDetectionSuppression';

const MODEL_FILENAME = 'det_10g.onnx';
const INPUT_WIDTH = 640;
const INPUT_HEIGHT = 640;
const STEPS = [8, 16, 32] as const;
const MIN_SIZES = [[16, 32], [64, 128], [256, 512]] as const;
const VARIANCE = [0.1, 0.2] as const;
const MODEL_PATH = resolveOnnxModelPath({
    modelFileName: MODEL_FILENAME,
    moduleDir: __dirname,
});

export interface FaceDetectionCandidate {
    score: number;
    box: [number, number, number, number];
    landmarks: Array<{ x: number; y: number }>;
}

function clampUnit(value: number): number {
    return Math.max(0, Math.min(1, value));
}

export class RetinaFaceDetector {
    private session: ort.InferenceSession | null = null;
    private anchors: number[][] = [];

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

        const transform = createModelToImageTransform({
            imageWidth: orientedDimensions.width,
            imageHeight: orientedDimensions.height,
            modelWidth: INPUT_WIDTH,
            modelHeight: INPUT_HEIGHT,
        });

        const buffer = await image
            .rotate()
            .resize(INPUT_WIDTH, INPUT_HEIGHT, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 1 },
            })
            .removeAlpha()
            .raw()
            .toBuffer();

        const float32Data = new Float32Array(3 * INPUT_HEIGHT * INPUT_WIDTH);
        for (let index = 0; index < INPUT_HEIGHT * INPUT_WIDTH; index += 1) {
            float32Data[index] = (buffer[index * 3] - 127.5) / 128.0;
            float32Data[index + INPUT_HEIGHT * INPUT_WIDTH] = (buffer[index * 3 + 1] - 127.5) / 128.0;
            float32Data[index + 2 * INPUT_HEIGHT * INPUT_WIDTH] = (buffer[index * 3 + 2] - 127.5) / 128.0;
        }

        const tensor = new ort.Tensor('float32', float32Data, [1, 3, INPUT_HEIGHT, INPUT_WIDTH]);
        const results = await this.session!.run({ 'input.1': tensor });
        return this.postProcess(results, transform);
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
        this.anchors = this.generateAnchors();
    }

    private generateAnchors(): number[][] {
        const anchors: number[][] = [];
        const featureMaps = STEPS.map((step) => [Math.ceil(INPUT_HEIGHT / step), Math.ceil(INPUT_WIDTH / step)]);

        featureMaps.forEach((featureMap, featureIndex) => {
            const minSizes = MIN_SIZES[featureIndex];
            for (let row = 0; row < featureMap[0]; row += 1) {
                for (let column = 0; column < featureMap[1]; column += 1) {
                    for (const minSize of minSizes) {
                        anchors.push([
                            (column + 0.5) * STEPS[featureIndex] / INPUT_WIDTH,
                            (row + 0.5) * STEPS[featureIndex] / INPUT_HEIGHT,
                            minSize / INPUT_WIDTH,
                            minSize / INPUT_HEIGHT,
                        ]);
                    }
                }
            }
        });

        return anchors;
    }

    private postProcess(results: Record<string, ort.Tensor>, transform: ModelToImageTransform): FaceDetectionCandidate[] {
        try {
            const scores = Float32Array.from([
                ...(results['448'].data as Float32Array),
                ...(results['471'].data as Float32Array),
                ...(results['494'].data as Float32Array),
            ]);
            const boxes = Float32Array.from([
                ...(results['451'].data as Float32Array),
                ...(results['474'].data as Float32Array),
                ...(results['497'].data as Float32Array),
            ]);
            const landmarks = Float32Array.from([
                ...(results['454'].data as Float32Array),
                ...(results['477'].data as Float32Array),
                ...(results['500'].data as Float32Array),
            ]);
            return suppressDuplicateFaceCandidates(this.buildCandidates(scores, boxes, landmarks, transform));
        } catch {
            return [];
        }
    }

    private buildCandidates(
        scores: Float32Array,
        boxes: Float32Array,
        landmarks: Float32Array,
        transform: ModelToImageTransform,
    ): FaceDetectionCandidate[] {
        const candidates: FaceDetectionCandidate[] = [];
        for (let index = 0; index < this.anchors.length; index += 1) {
            const score = scores[index];
            if (score <= 0.5) {
                continue;
            }

            const anchor = this.anchors[index];
            const dx = boxes[index * 4];
            const dy = boxes[index * 4 + 1];
            const dw = boxes[index * 4 + 2];
            const dh = boxes[index * 4 + 3];
            const cx = anchor[0] + dx * VARIANCE[0] * anchor[2];
            const cy = anchor[1] + dy * VARIANCE[0] * anchor[3];
            const width = anchor[2] * Math.exp(dw * VARIANCE[1]);
            const height = anchor[3] * Math.exp(dh * VARIANCE[1]);

            const faceLandmarks = [];
            for (let landmarkIndex = 0; landmarkIndex < 5; landmarkIndex += 1) {
                const x = anchor[0] + landmarks[index * 10 + landmarkIndex * 2] * VARIANCE[0] * anchor[2];
                const y = anchor[1] + landmarks[index * 10 + landmarkIndex * 2 + 1] * VARIANCE[0] * anchor[3];
                faceLandmarks.push(mapPointFromModelToImage({ x: clampUnit(x), y: clampUnit(y) }, transform));
            }

            const mappedBox = mapBoxFromModelToImage(
                [
                    clampUnit(cx - width / 2),
                    clampUnit(cy - height / 2),
                    clampUnit(cx + width / 2),
                    clampUnit(cy + height / 2),
                ],
                transform,
            );

            candidates.push({
                score,
                box: mappedBox,
                landmarks: faceLandmarks,
            });
        }

        return candidates;
    }
}
