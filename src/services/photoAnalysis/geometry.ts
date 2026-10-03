/** All persisted analysis geometry uses the EXIF-oriented full photo, unit xywh. */
export type CanonicalPhotoBox = { x: number; y: number; width: number; height: number };

/** Model geometry is always named corners in [0, 1000] relative to sourceImageId. */
export type ModelBoundingBox = { left: number; top: number; right: number; bottom: number };

export type AnalysisImageSource = {
    id: string;
    assetId: string;
    kind: 'overview' | 'face' | 'detail';
    faceId?: string;
    regionId?: string;
    width: number;
    height: number;
    fullPhotoBox: CanonicalPhotoBox;
};

export type StableAnalysisFace = {
    faceId: string;
    modelFaceId: string;
    box: CanonicalPhotoBox;
};

export type PixelCrop = { left: number; top: number; width: number; height: number };
export type ImageDimensions = { width: number; height: number };

export function assertCanonicalPhotoBox(box: CanonicalPhotoBox): void {
    const finite = [box.x, box.y, box.width, box.height].every(Number.isFinite);
    if (!finite || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0
        || box.x + box.width > 1 || box.y + box.height > 1) {
        throw new Error('Analysis box must be positive normalized xywh within the oriented full photo.');
    }
}

export function assertImageDimensions(dimensions: ImageDimensions): void {
    if (!Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height)
        || dimensions.width < 1 || dimensions.height < 1) {
        throw new Error('Analysis image dimensions must be positive integer pixels.');
    }
}

export function assertModelBoundingBox(box: ModelBoundingBox): void {
    const finite = [box.left, box.top, box.right, box.bottom].every(Number.isFinite);
    if (!finite || box.left < 0 || box.top < 0 || box.right > 1000 || box.bottom > 1000
        || box.left >= box.right || box.top >= box.bottom) {
        throw new Error('Model box must use left/top/right/bottom corners within [0, 1000].');
    }
}

/** Round outward once; retain this exact pixel footprint in the image manifest. */
export function canonicalBoxToPixelCrop(box: CanonicalPhotoBox, dimensions: ImageDimensions): PixelCrop {
    assertCanonicalPhotoBox(box);
    assertImageDimensions(dimensions);
    const left = Math.floor(box.x * dimensions.width);
    const top = Math.floor(box.y * dimensions.height);
    const right = Math.min(dimensions.width, Math.ceil((box.x + box.width) * dimensions.width));
    const bottom = Math.min(dimensions.height, Math.ceil((box.y + box.height) * dimensions.height));
    return { left, top, width: right - left, height: bottom - top };
}

export function pixelCropToCanonicalBox(crop: PixelCrop, dimensions: ImageDimensions): CanonicalPhotoBox {
    assertImageDimensions(dimensions);
    if (![crop.left, crop.top, crop.width, crop.height].every(Number.isSafeInteger)
        || crop.left < 0 || crop.top < 0 || crop.width <= 0 || crop.height <= 0
        || crop.left + crop.width > dimensions.width || crop.top + crop.height > dimensions.height) {
        throw new Error('Pixel crop must fit inside the oriented full photo.');
    }
    return {
        x: crop.left / dimensions.width,
        y: crop.top / dimensions.height,
        width: crop.width / dimensions.width,
        height: crop.height / dimensions.height,
    };
}

export function expandCanonicalBox(box: CanonicalPhotoBox, paddingFraction: number): CanonicalPhotoBox {
    assertCanonicalPhotoBox(box);
    if (!Number.isFinite(paddingFraction) || paddingFraction < 0 || paddingFraction > 1) {
        throw new Error('Crop padding must be a fraction within [0, 1].');
    }
    const left = Math.max(0, box.x - box.width * paddingFraction);
    const top = Math.max(0, box.y - box.height * paddingFraction);
    const right = Math.min(1, box.x + box.width * (1 + paddingFraction));
    const bottom = Math.min(1, box.y + box.height * (1 + paddingFraction));
    return { x: left, y: top, width: right - left, height: bottom - top };
}

export function mapModelBoxToFullPhoto(params: {
    sourceImageId: string;
    box: ModelBoundingBox;
    sources: readonly AnalysisImageSource[];
}): CanonicalPhotoBox {
    const matches = params.sources.filter((source) => source.id === params.sourceImageId);
    if (!params.sourceImageId || matches.length !== 1) {
        throw new Error('Model geometry requires one unambiguous source image ID.');
    }
    const source = matches[0]!;
    assertModelBoundingBox(params.box);
    assertCanonicalPhotoBox(source.fullPhotoBox);
    const { left, top, right, bottom } = params.box;
    return {
        x: source.fullPhotoBox.x + source.fullPhotoBox.width * left / 1000,
        y: source.fullPhotoBox.y + source.fullPhotoBox.height * top / 1000,
        width: source.fullPhotoBox.width * (right - left) / 1000,
        height: source.fullPhotoBox.height * (bottom - top) / 1000,
    };
}

/** F labels are stable for a supplied set and never matched by visual position. */
export function assignModelFaceIds(faces: readonly { faceId: string; box: CanonicalPhotoBox }[]): StableAnalysisFace[] {
    const ids = new Set<string>();
    for (const face of faces) {
        assertCanonicalPhotoBox(face.box);
        if (!face.faceId || ids.has(face.faceId)) {
            throw new Error('Every supplied face must have a unique canonical Face ID.');
        }
        ids.add(face.faceId);
    }
    return [...faces]
        .sort((left, right) => left.faceId < right.faceId ? -1 : Number(left.faceId > right.faceId))
        .map((face, index) => ({ ...face, box: { ...face.box }, modelFaceId: `F${index + 1}` }));
}

export function resolveModelFaceId(modelFaceId: string, faces: readonly StableAnalysisFace[]): StableAnalysisFace {
    const matches = faces.filter((face) => face.modelFaceId === modelFaceId);
    if (matches.length !== 1) {
        throw new Error(`Unknown or ambiguous supplied Face ID: ${modelFaceId}`);
    }
    return matches[0]!;
}
