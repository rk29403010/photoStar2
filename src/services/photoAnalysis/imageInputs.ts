import sharp from 'sharp';
import {
    assignModelFaceIds,
    canonicalBoxToPixelCrop,
    expandCanonicalBox,
    pixelCropToCanonicalBox,
    type AnalysisImageSource,
    type CanonicalPhotoBox,
    type ImageDimensions,
    type StableAnalysisFace,
} from './geometry';

export type AnalysisImagePart = { sourceImageId: string; mimeType: 'image/jpeg'; data: string };
export type AnalysisImageLimits = { overview: number; face: number; detail: number; facePadding: number };
export type PreparedAnalysisImages = {
    dimensions: ImageDimensions;
    faces: StableAnalysisFace[];
    sources: AnalysisImageSource[];
    parts: AnalysisImagePart[];
};

type CropRequest = {
    id: string;
    kind: AnalysisImageSource['kind'];
    box: CanonicalPhotoBox;
    maxDimension: number;
    faceId?: string;
    regionId?: string;
};

export const DEFAULT_ANALYSIS_IMAGE_LIMITS: Readonly<AnalysisImageLimits> = {
    overview: 1536,
    face: 512,
    detail: 2048,
    facePadding: 0.25,
};

function resolveLimits(overrides?: Partial<AnalysisImageLimits>): AnalysisImageLimits {
    const limits = { ...DEFAULT_ANALYSIS_IMAGE_LIMITS, ...overrides };
    for (const size of [limits.overview, limits.face, limits.detail]) {
        if (!Number.isSafeInteger(size) || size < 1) {
            throw new Error('Analysis image size limits must be positive integer pixels.');
        }
    }
    // Validate padding even when no faces are supplied.
    expandCanonicalBox({ x: 0, y: 0, width: 1, height: 1 }, limits.facePadding);
    return limits;
}

function createCropRequests(params: {
    assetId: string;
    faces: StableAnalysisFace[];
    details: readonly { regionId: string; box: CanonicalPhotoBox }[];
    limits: AnalysisImageLimits;
}): CropRequest[] {
    const requests: CropRequest[] = [{
        id: `${params.assetId}:overview`, kind: 'overview',
        box: { x: 0, y: 0, width: 1, height: 1 }, maxDimension: params.limits.overview,
    }];
    for (const face of params.faces) {
        requests.push({
            id: `${params.assetId}:face:${face.faceId}`, kind: 'face', faceId: face.faceId,
            box: expandCanonicalBox(face.box, params.limits.facePadding), maxDimension: params.limits.face,
        });
    }
    const regionIds = new Set<string>();
    for (const detail of params.details) {
        if (!detail.regionId || regionIds.has(detail.regionId)) {
            throw new Error('Detail crops require unique region IDs.');
        }
        regionIds.add(detail.regionId);
        requests.push({
            id: `${params.assetId}:detail:${detail.regionId}`, kind: 'detail', regionId: detail.regionId,
            box: detail.box, maxDimension: params.limits.detail,
        });
    }
    return requests;
}

async function encodeCrop(params: {
    orientedPixels: Buffer;
    dimensions: ImageDimensions;
    request: CropRequest;
    assetId: string;
}): Promise<{ source: AnalysisImageSource; part: AnalysisImagePart }> {
    const crop = canonicalBoxToPixelCrop(params.request.box, params.dimensions);
    const encoded = await sharp(params.orientedPixels)
        .extract(crop)
        .resize(params.request.maxDimension, params.request.maxDimension, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer({ resolveWithObject: true });
    const { id, kind, faceId, regionId } = params.request;
    return {
        source: {
            id, assetId: params.assetId, kind,
            ...(faceId ? { faceId } : {}), ...(regionId ? { regionId } : {}),
            width: encoded.info.width, height: encoded.info.height,
            fullPhotoBox: pixelCropToCanonicalBox(crop, params.dimensions),
        },
        part: { sourceImageId: id, mimeType: 'image/jpeg', data: encoded.data.toString('base64') },
    };
}

/** Decode and orient once; every input derives from the same canonical raster. No fallback changes geometry. */
export async function prepareAnalysisImages(params: {
    assetId: string;
    imagePath: string;
    faces?: readonly { faceId: string; box: CanonicalPhotoBox }[];
    details?: readonly { regionId: string; box: CanonicalPhotoBox }[];
    limits?: Partial<AnalysisImageLimits>;
}): Promise<PreparedAnalysisImages> {
    if (!params.assetId) {
        throw new Error('Image preparation requires an asset ID.');
    }
    const limits = resolveLimits(params.limits);
    const faces = assignModelFaceIds(params.faces ?? []);
    const requests = createCropRequests({ assetId: params.assetId, faces, details: params.details ?? [], limits });
    const oriented = await sharp(params.imagePath).rotate().png().toBuffer({ resolveWithObject: true });
    const dimensions = { width: oriented.info.width, height: oriented.info.height };
    const sources: AnalysisImageSource[] = [];
    const parts: AnalysisImagePart[] = [];
    for (const request of requests) {
        const encoded = await encodeCrop({ orientedPixels: oriented.data, dimensions, request, assetId: params.assetId });
        sources.push(encoded.source);
        parts.push(encoded.part);
    }
    return { dimensions, faces, sources, parts };
}
