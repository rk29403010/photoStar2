import { existsSync } from 'node:fs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as ort from 'onnxruntime-node';
import { resolveOnnxModelPath } from '../modelPaths';
import { maskBoundingBox, SegmentationProviderError } from './contracts';
import type { NormalizedBox, NormalizedPoint, PreparedSegmentationImage, SegmentationImage, SegmentationMask, SegmentationPrompt, SegmentationProvider } from './contracts';
import { resolveSegmentationModelState, segmentationModelManifests } from './modelManifest';

const MODEL_FILENAME = 'fastsam-s-fp32.onnx';
const modelPath = resolveOnnxModelPath({ modelFileName: MODEL_FILENAME, moduleDir: __dirname });
const MAX_CANDIDATES = 100;
const CONFIDENCE_THRESHOLD = 0.4;
const IOU_THRESHOLD = 0.9;

type FastSamPrepared = PreparedSegmentationImage & { session: ort.InferenceSession; candidates?: SegmentationMask[] };
type Detection = { box: [number, number, number, number]; score: number; coefficients: Float32Array };
export type FastSamProviderOptions = { modelPath?: string; sessionFactory?: (path: string) => Promise<ort.InferenceSession>; verifyChecksum?: boolean };

function sigmoid(value: number): number { return 1 / (1 + Math.exp(-value)); }
function boxIou(left: NormalizedBox, right: NormalizedBox): number {
    const x1 = Math.max(left.x, right.x); const y1 = Math.max(left.y, right.y);
    const x2 = Math.min(left.x + left.width, right.x + right.width); const y2 = Math.min(left.y + left.height, right.y + right.height);
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = left.width * left.height + right.width * right.height - intersection;
    return union === 0 ? 0 : intersection / union;
}

function pointInBox(point: NormalizedPoint, box: NormalizedBox): boolean { return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height; }

function normalizedBox(box: [number, number, number, number], image: SegmentationImage): NormalizedBox {
    const [centerX, centerY, width, height] = box;
    const sourceWidth = image.sourceWidth ?? image.width; const sourceHeight = image.sourceHeight ?? image.height;
    const scale = image.scale ?? 1; const padX = image.padX ?? 0; const padY = image.padY ?? 0;
    const x1 = Math.max(0, Math.min(sourceWidth, (centerX - width / 2 - padX) / scale));
    const y1 = Math.max(0, Math.min(sourceHeight, (centerY - height / 2 - padY) / scale));
    const x2 = Math.max(0, Math.min(sourceWidth, (centerX + width / 2 - padX) / scale));
    const y2 = Math.max(0, Math.min(sourceHeight, (centerY + height / 2 - padY) / scale));
    return { x: x1 / sourceWidth, y: y1 / sourceHeight, width: Math.max(0, x2 - x1) / sourceWidth, height: Math.max(0, y2 - y1) / sourceHeight };
}

function parseDetections(output: ort.Tensor, prototypeChannels: number, image: SegmentationImage): Detection[] {
    const dimensions = output.dims;
    const data = output.data as Float32Array;
    if (dimensions.length !== 3 || dimensions[0] !== 1 || dimensions[1] < 5 + prototypeChannels) { throw new SegmentationProviderError('fastsam', 'model_incompatible', 'FastSAM detection output must have shape [1, attributes, candidates].'); }
    const attributes = dimensions[1]; const count = dimensions[2];
    const detections: Detection[] = [];
    for (let candidate = 0; candidate < count; candidate += 1) {
        const value = (attribute: number) => data[attribute * count + candidate];
        const score = value(4);
        if (!Number.isFinite(score) || score < CONFIDENCE_THRESHOLD) { continue; }
        const box: [number, number, number, number] = [value(0), value(1), value(2), value(3)];
        const normalized = normalizedBox(box, image);
        if (normalized.width === 0 || normalized.height === 0) { continue; }
        const coefficients = new Float32Array(prototypeChannels);
        for (let channel = 0; channel < prototypeChannels; channel += 1) { coefficients[channel] = value(attributes - prototypeChannels + channel); }
        detections.push({ box, score, coefficients });
    }
    return detections.sort((left, right) => right.score - left.score);
}

function renderMask(detection: Detection, prototypes: ort.Tensor, image: SegmentationImage): SegmentationMask {
    const dimensions = prototypes.dims;
    if (dimensions.length !== 4 || dimensions[0] !== 1 || dimensions[1] !== detection.coefficients.length) { throw new SegmentationProviderError('fastsam', 'model_incompatible', 'FastSAM prototype output has an incompatible channel dimension.'); }
    const prototypeHeight = dimensions[2]; const prototypeWidth = dimensions[3];
    const sourceWidth = image.sourceWidth ?? image.width; const sourceHeight = image.sourceHeight ?? image.height;
    const data = prototypes.data as Float32Array; const alpha = new Uint8Array(sourceWidth * sourceHeight);
    const [centerX, centerY, boxWidth, boxHeight] = detection.box;
    const modelX1 = centerX - boxWidth / 2; const modelY1 = centerY - boxHeight / 2;
    const modelX2 = centerX + boxWidth / 2; const modelY2 = centerY + boxHeight / 2;
    const scale = image.scale ?? 1; const padX = image.padX ?? 0; const padY = image.padY ?? 0;
    for (let y = 0; y < sourceHeight; y += 1) { renderMaskRow({ y, sourceWidth, scale, padX, padY, modelX1, modelX2, modelY1, modelY2, prototypeWidth, prototypeHeight, image, dimensions, data, detection, alpha }); }
    return { alpha, width: sourceWidth, height: sourceHeight, box: maskBoundingBox(alpha, sourceWidth, sourceHeight), score: detection.score };
}

function renderMaskRow(input: { y: number; sourceWidth: number; scale: number; padX: number; padY: number; modelX1: number; modelX2: number; modelY1: number; modelY2: number; prototypeWidth: number; prototypeHeight: number; image: SegmentationImage; dimensions: readonly number[]; data: Float32Array; detection: Detection; alpha: Uint8Array }): void {
    const modelY = input.y * input.scale + input.padY;
    if (modelY < input.modelY1 || modelY > input.modelY2) { return; }
    for (let x = 0; x < input.sourceWidth; x += 1) {
        const modelX = x * input.scale + input.padX;
        if (modelX >= input.modelX1 && modelX <= input.modelX2) { input.alpha[input.y * input.sourceWidth + x] = maskPixel(modelX, modelY, input) ? 255 : 0; }
    }
}

function maskPixel(modelX: number, modelY: number, input: Parameters<typeof renderMaskRow>[0]): boolean {
    const prototypeX = Math.min(input.prototypeWidth - 1, Math.max(0, Math.floor(modelX / input.image.width * input.prototypeWidth)));
    const prototypeY = Math.min(input.prototypeHeight - 1, Math.max(0, Math.floor(modelY / input.image.height * input.prototypeHeight)));
    let logit = 0;
    for (let channel = 0; channel < input.dimensions[1]; channel += 1) { logit += input.detection.coefficients[channel] * input.data[(channel * input.prototypeHeight + prototypeY) * input.prototypeWidth + prototypeX]; }
    return sigmoid(logit) >= 0.5;
}

function selectPromptCandidates(candidates: SegmentationMask[], prompt: SegmentationPrompt): SegmentationMask[] {
    const positive = prompt.positivePoints ?? []; const negative = prompt.negativePoints ?? [];
    const selected = candidates.filter((candidate) => {
        const contains = (point: NormalizedPoint) => pointInBox(point, candidate.box) && candidate.alpha[Math.min(candidate.alpha.length - 1, Math.floor(point.y * candidate.height) * candidate.width + Math.floor(point.x * candidate.width))] > 0;
        return positive.every(contains) && negative.every((point) => !contains(point));
    });
    if (!prompt.box) { return selected; }
    return selected.filter((candidate) => boxIou(candidate.box, prompt.box as NormalizedBox) > 0).sort((left, right) => boxIou(right.box, prompt.box as NormalizedBox) - boxIou(left.box, prompt.box as NormalizedBox) || (right.score ?? 0) - (left.score ?? 0));
}

function findFastSamOutputs(tensors: ort.Tensor[]): { detections: ort.Tensor; prototypes: ort.Tensor } {
    const detections = tensors.find((tensor) => tensor.dims.length === 3);
    const prototypeChannels = detections?.dims[1] ? detections.dims[1] - 5 : 0;
    const prototypes = tensors.find((tensor) => tensor.dims.length === 4 && tensor.dims[1] === prototypeChannels);
    if (!prototypes || !detections) { throw new SegmentationProviderError('fastsam', 'model_incompatible', 'FastSAM ONNX outputs do not match the detection/prototype contract.'); }
    return { detections, prototypes };
}

function reconstructCandidates(detections: Detection[], prototypes: ort.Tensor, image: SegmentationImage): SegmentationMask[] {
    const retained: SegmentationMask[] = [];
    for (const detection of suppressDetectionOverlaps(detections, image)) {
        const mask = renderMask(detection, prototypes, image);
        if (mask.box.width > 0 && mask.box.height > 0 && !retained.some((candidate) => boxIou(candidate.box, mask.box) >= IOU_THRESHOLD)) { retained.push(mask); }
        if (retained.length >= MAX_CANDIDATES) { break; }
    }
    return retained;
}

function suppressDetectionOverlaps(detections: Detection[], image: SegmentationImage): Detection[] {
    const retained: Detection[] = [];
    for (const detection of detections) {
        const candidateBox = normalizedBox(detection.box, image);
        if (!retained.some((other) => boxIou(candidateBox, normalizedBox(other.box, image)) >= IOU_THRESHOLD)) { retained.push(detection); }
    }
    return retained;
}

/** Official FastSAM-s ONNX: one image feed, detection coefficients and mask prototypes. Prompts select reconstructed instances. */
export class FastSamSegmentationProvider implements SegmentationProvider {
    readonly id = 'fastsam' as const;
    readonly modelId = 'fastsam-s-fp32';
    readonly modelVersion = 'official-fastsam-s';
    readonly capabilities = { positivePoints: true, boxes: true, automaticCandidates: true };
    private session: ort.InferenceSession | undefined;
    private readonly configuredModelPath: string;
    private readonly sessionFactory: (path: string) => Promise<ort.InferenceSession>;
    private readonly verifyChecksum: boolean;
    constructor(options: FastSamProviderOptions = {}) {
        this.configuredModelPath = options.modelPath ?? modelPath;
        this.sessionFactory = options.sessionFactory ?? ((path) => ort.InferenceSession.create(path, { logSeverityLevel: 3 }));
        this.verifyChecksum = options.verifyChecksum ?? true;
    }
    getModelInstallationState() { return resolveSegmentationModelState(segmentationModelManifests[0], dirname(this.configuredModelPath)); }
    isAvailable(): boolean { return this.verifyChecksum ? this.getModelInstallationState() === 'installed_and_verified' : existsSync(this.configuredModelPath); }
    async prepare(image: SegmentationImage): Promise<FastSamPrepared> { return { providerId: this.id, image, session: await this.getSession(), dispose: async () => {} }; }
    async segment(prepared: PreparedSegmentationImage, prompt: SegmentationPrompt): Promise<SegmentationMask[]> { const state = prepared as FastSamPrepared; return selectPromptCandidates(await this.candidates(state), prompt); }
    async automaticCandidates(prepared: PreparedSegmentationImage): Promise<SegmentationMask[]> { return this.candidates(prepared as FastSamPrepared); }
    async dispose(): Promise<void> { this.session = undefined; }
    private async candidates(prepared: FastSamPrepared): Promise<SegmentationMask[]> {
        if (prepared.candidates) { return prepared.candidates; }
        if (prepared.session.inputNames.length !== 1) { throw new SegmentationProviderError(this.id, 'model_incompatible', 'FastSAM ONNX must accept exactly one image tensor; SAM point inputs are incompatible.'); }
        const output = await prepared.session.run({ [prepared.session.inputNames[0]]: new ort.Tensor('float32', prepared.image.pixels, [1, 3, prepared.image.height, prepared.image.width]) });
        const { detections, prototypes } = findFastSamOutputs(Object.values(output));
        prepared.candidates = reconstructCandidates(parseDetections(detections, prototypes.dims[1], prepared.image), prototypes, prepared.image);
        return prepared.candidates;
    }
    private async getSession(): Promise<ort.InferenceSession> {
        if (this.session) { return this.session; }
        if (!this.isAvailable()) {
            const state = this.getModelInstallationState();
            const code = state === 'installed_but_corrupt' ? 'model_checksum_mismatch' : 'model_missing';
            throw new SegmentationProviderError(this.id, code, `FastSAM-s FP32 is ${state.replaceAll('_', ' ')} at ${this.configuredModelPath}. Open Model Manager or follow the development manual-install instructions.`);
        }
        let usablePath = this.configuredModelPath;
        if (this.configuredModelPath.includes('snapshot')) { usablePath = join(tmpdir(), MODEL_FILENAME); if (!existsSync(usablePath)) { mkdirSync(dirname(usablePath), { recursive: true }); copyFileSync(this.configuredModelPath, usablePath); } }
        try { this.session = await this.sessionFactory(usablePath); return this.session; }
        catch (error) { throw new SegmentationProviderError(this.id, 'model_incompatible', error instanceof Error ? error.message : String(error)); }
    }
}
