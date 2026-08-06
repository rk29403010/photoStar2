import { dirname } from 'node:path';
import * as ort from 'onnxruntime-node';
import { resolveOnnxModelPath } from '../modelPaths';
import { maskBoundingBox, normalizedPointToPixels, SegmentationProviderError } from './contracts';
import type { PreparedSegmentationImage, SegmentationImage, SegmentationMask, SegmentationPrompt, SegmentationProvider } from './contracts';
import { resolveSegmentationModelState, segmentationModelManifests } from './modelManifest';

type EfficientPrepared = PreparedSegmentationImage & { embedding: ort.Tensor };
type Sessions = { encoder: ort.InferenceSession; decoder: ort.InferenceSession };
type SessionsPaths = { encoderPath: string; decoderPath: string };

function resolveModelPaths(): SessionsPaths {
    return {
        encoderPath: resolveOnnxModelPath({ modelFileName: 'efficient_sam_vitt_encoder.onnx', moduleDir: __dirname }),
        decoderPath: resolveOnnxModelPath({ modelFileName: 'efficient_sam_vitt_decoder.onnx', moduleDir: __dirname }),
    };
}

/** EfficientSAM-Ti ONNX split model. Tensor names follow the official export wrapper. */
export class EfficientSamSegmentationProvider implements SegmentationProvider {
    readonly id = 'efficientsam' as const;
    readonly modelId = 'efficient-sam-ti';
    readonly modelVersion = '1.0';
    readonly capabilities = { positivePoints: true, boxes: true, automaticCandidates: false };
    private sessions: Sessions | undefined;
    getModelInstallationState() { return resolveSegmentationModelState(segmentationModelManifests[1], dirname(resolveModelPaths().encoderPath)); }
    isAvailable(): boolean { return this.getModelInstallationState() === 'installed_and_verified'; }
    async prepare(image: SegmentationImage): Promise<EfficientPrepared> {
        const sessions = await this.getSessions();
        const result = await sessions.encoder.run({ batched_images: new ort.Tensor('float32', image.pixels, [1, 3, image.height, image.width]) });
        const embedding = result.image_embeddings ?? Object.values(result)[0];
        if (!embedding) {throw new SegmentationProviderError(this.id, 'model_incompatible', 'EfficientSAM encoder produced no embedding.');}
        return { providerId: this.id, image, embedding, dispose: async () => {} };
    }
    async segment(prepared: PreparedSegmentationImage, prompt: SegmentationPrompt): Promise<SegmentationMask[]> {
        const state = prepared as EfficientPrepared; const { image } = prepared;
        const points = prompt.positivePoints?.length ? prompt.positivePoints : [{ x: 0.5, y: 0.5 }];
        const coordinates = points.flatMap((point) => normalizedPointToPixels(point, image));
        const labels = points.map(() => 1);
        if (prompt.box) { const [x, y] = normalizedPointToPixels(prompt.box, image); coordinates.push(x, y, x + prompt.box.width * image.width, y + prompt.box.height * image.height); labels.push(2, 3); }
        const sessions = await this.getSessions();
        const output = await sessions.decoder.run({ image_embeddings: state.embedding, batched_point_coords: new ort.Tensor('float32', new Float32Array(coordinates), [1, 1, labels.length, 2]), batched_point_labels: new ort.Tensor('float32', new Float32Array(labels), [1, 1, labels.length]), orig_im_size: new ort.Tensor('int64', BigInt64Array.from([BigInt(image.height), BigInt(image.width)]), [2]) });
        const masks = output.output_masks; const scores = output.iou_predictions;
        if (!masks) {throw new SegmentationProviderError(this.id, 'model_incompatible', 'EfficientSAM decoder produced no masks.');}
        const raw = masks.data as Float32Array; const candidateCount = masks.dims[2] ?? 1; const stride = raw.length / candidateCount; const scoreData = scores?.data as Float32Array | undefined;
        const best = scoreData ? scoreData.reduce((winner, score, index) => score > scoreData[winner] ? index : winner, 0) : 0;
        const alpha = new Uint8Array(image.width * image.height); const offset = best * stride; for (let index = 0; index < alpha.length; index += 1) {alpha[index] = raw[offset + index] >= 0 ? 255 : 0;}
        return [{ alpha, width: image.width, height: image.height, box: maskBoundingBox(alpha, image.width, image.height), score: scoreData?.[best] }];
    }
    async automaticCandidates(prepared: PreparedSegmentationImage): Promise<SegmentationMask[]> {
        const points = [0.25, 0.5, 0.75];
        const candidates = await Promise.all(points.flatMap((y) => points.map((x) => this.segment(prepared, { positivePoints: [{ x, y }] }))));
        return candidates.flat();
    }
    async dispose(): Promise<void> { this.sessions = undefined; }
    private async getSessions(): Promise<Sessions> { if (this.sessions) {return this.sessions;} if (!this.isAvailable()) { const state = this.getModelInstallationState(); throw new SegmentationProviderError(this.id, state === 'installed_but_corrupt' ? 'model_checksum_mismatch' : 'model_missing', `EfficientSAM-Ti is ${state.replaceAll('_', ' ')}. Open Model Manager or run the explicit verified installer.`); } const paths = resolveModelPaths(); try { this.sessions = { encoder: await ort.InferenceSession.create(paths.encoderPath), decoder: await ort.InferenceSession.create(paths.decoderPath) }; return this.sessions; } catch (error) { throw new SegmentationProviderError(this.id, 'model_incompatible', error instanceof Error ? error.message : String(error)); } }
}
