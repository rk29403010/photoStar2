export type SegmentationProviderId = 'fastsam' | 'efficientsam';
export type SegmentationProviderSelection = SegmentationProviderId | 'auto';
export type SegmentationProcessingProfile = 'fast' | 'accurate';

export type NormalizedPoint = { x: number; y: number };
export type NormalizedBox = NormalizedPoint & { width: number; height: number };
export type SegmentationPrompt = { positivePoints?: NormalizedPoint[]; negativePoints?: NormalizedPoint[]; box?: NormalizedBox };
export type SegmentationImage = {
    pixels: Float32Array;
    width: number;
    height: number;
    sourceWidth?: number;
    sourceHeight?: number;
    scale?: number;
    padX?: number;
    padY?: number;
};
export type SegmentationMask = {
    alpha: Uint8Array;
    width: number;
    height: number;
    box: NormalizedBox;
    score?: number;
    stability?: number;
};
export type SegmentationCapabilities = { positivePoints: boolean; boxes: boolean; automaticCandidates: boolean };
export type PreparedSegmentationImage = { providerId: SegmentationProviderId; image: SegmentationImage; dispose(): Promise<void> };

export type SegmentationProvider = {
    readonly id: SegmentationProviderId;
    readonly modelId: string;
    readonly modelVersion: string;
    readonly capabilities: SegmentationCapabilities;
    /** Model-neutral, reproducible filtering settings; never raw tensor details. */
    readonly inferenceProfile?: Readonly<Record<string, boolean | number | string>>;
    isAvailable(): boolean;
    prepare(image: SegmentationImage): Promise<PreparedSegmentationImage>;
    segment(prepared: PreparedSegmentationImage, prompt: SegmentationPrompt): Promise<SegmentationMask[]>;
    automaticCandidates(prepared: PreparedSegmentationImage): Promise<SegmentationMask[]>;
    dispose(): Promise<void>;
};

export class SegmentationProviderError extends Error {
    constructor(public readonly providerId: SegmentationProviderId, public readonly code: 'model_missing' | 'model_checksum_mismatch' | 'model_incompatible' | 'invalid_input' | 'inference_failed' | 'cancelled', message: string) {
        super(message);
        this.name = 'SegmentationProviderError';
    }
}

export function normalizedPointToPixels(point: NormalizedPoint, image: SegmentationImage): [number, number] {
    return [Math.min(1, Math.max(0, point.x)) * image.width, Math.min(1, Math.max(0, point.y)) * image.height];
}

export function maskBoundingBox(alpha: Uint8Array, width: number, height: number): NormalizedBox {
    let minX = width; let minY = height; let maxX = -1; let maxY = -1;
    for (let index = 0; index < alpha.length; index += 1) {
        if (alpha[index] > 0) { const x = index % width; const y = Math.floor(index / width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    }
    return maxX < 0 ? { x: 0, y: 0, width: 0, height: 0 } : { x: minX / width, y: minY / height, width: (maxX - minX + 1) / width, height: (maxY - minY + 1) / height };
}
