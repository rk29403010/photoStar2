type DimensionsInput = {
    width?: number | null | undefined;
    height?: number | null | undefined;
    orientation?: number | null | undefined;
};

export type StoredPhotoBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type PixelCrop = {
    left: number;
    top: number;
    width: number;
    height: number;
};

export type OrientedDimensions = {
    width: number;
    height: number;
};

export type ModelToImageTransform = {
    modelWidth: number;
    modelHeight: number;
    imageWidth: number;
    imageHeight: number;
    scale: number;
    padX: number;
    padY: number;
    contentWidth: number;
    contentHeight: number;
};

function clampUnit(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function cleanFloat(value: number): number {
    return Number.parseFloat(value.toFixed(6));
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStoredPhotoBox(
    x: number,
    y: number,
    width: number,
    height: number,
): StoredPhotoBox | null {
    if (width <= 0 || height <= 0) {
        return null;
    }

    const clampedX = clampUnit(x);
    const clampedY = clampUnit(y);
    const clampedRight = clampUnit(x + width);
    const clampedBottom = clampUnit(y + height);
    const clampedWidth = clampedRight - clampedX;
    const clampedHeight = clampedBottom - clampedY;
    if (clampedWidth <= 0 || clampedHeight <= 0) {
        return null;
    }

    return {
        x: cleanFloat(clampedX),
        y: cleanFloat(clampedY),
        width: cleanFloat(clampedWidth),
        height: cleanFloat(clampedHeight),
    };
}

function normalizeStoredPhotoBoxScale(box: StoredPhotoBox): StoredPhotoBox {
    const scale = box.x > 1 || box.y > 1 || box.width > 1 || box.height > 1 ? 1000 : 1;
    return {
        x: cleanFloat(box.x / scale),
        y: cleanFloat(box.y / scale),
        width: cleanFloat(box.width / scale),
        height: cleanFloat(box.height / scale),
    };
}

function readStoredPhotoBoxFromRecord(value: Record<string, unknown>): StoredPhotoBox | null {
    if (!isFiniteNumber(value.x)
        || !isFiniteNumber(value.y)
        || !isFiniteNumber(value.width)
        || !isFiniteNumber(value.height)) {
        return null;
    }

    return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
    };
}

function readStoredPhotoBoxFromCorners(value: unknown[]): StoredPhotoBox | null {
    if (value.length < 4
        || !isFiniteNumber(value[0])
        || !isFiniteNumber(value[1])
        || !isFiniteNumber(value[2])
        || !isFiniteNumber(value[3])) {
        return null;
    }

    return toStoredPhotoBox(
        value[0],
        value[1],
        value[2] - value[0],
        value[3] - value[1],
    );
}

function hasCanonicalStoredPhotoBoxBounds(box: StoredPhotoBox): boolean {
    return box.x >= 0
        && box.y >= 0
        && box.width > 0
        && box.height > 0
        && box.x <= 1
        && box.y <= 1
        && box.width <= 1
        && box.height <= 1
        && box.x + box.width <= 1
        && box.y + box.height <= 1;
}

export function isCanonicalStoredPhotoBox(value: unknown): value is StoredPhotoBox {
    if (!isRecord(value)) {
        return false;
    }

    const box = readStoredPhotoBoxFromRecord(value);
    if (!box) {
        return false;
    }

    return hasCanonicalStoredPhotoBoxBounds(box);
}

export function readCanonicalStoredPhotoBox(value: unknown): StoredPhotoBox | null {
    return isCanonicalStoredPhotoBox(value)
        ? {
            x: value.x,
            y: value.y,
            width: value.width,
            height: value.height,
        }
        : null;
}

export function normalizeStoredPhotoBox(value: unknown): StoredPhotoBox | null {
    if (Array.isArray(value)) {
        return readStoredPhotoBoxFromCorners(value);
    }

    if (!isRecord(value)) {
        return null;
    }

    const box = readStoredPhotoBoxFromRecord(value);
    if (!box) {
        return null;
    }

    const scaledBox = normalizeStoredPhotoBoxScale(box);
    return toStoredPhotoBox(scaledBox.x, scaledBox.y, scaledBox.width, scaledBox.height);
}

export function storedPhotoBoxToUnitCorners(box: StoredPhotoBox): [number, number, number, number] {
    return [
        cleanFloat(box.x),
        cleanFloat(box.y),
        cleanFloat(box.x + box.width),
        cleanFloat(box.y + box.height),
    ];
}

export function storedPhotoBoxToPixelCrop(
    box: StoredPhotoBox,
    dimensions: { width: number; height: number },
): PixelCrop {
    return {
        left: Math.floor(box.x * dimensions.width),
        top: Math.floor(box.y * dimensions.height),
        width: Math.floor(box.width * dimensions.width),
        height: Math.floor(box.height * dimensions.height),
    };
}

export function getOrientedDimensions(input: DimensionsInput): OrientedDimensions | null {
    if (!input.width || !input.height) {
        return null;
    }

    const shouldSwapAxes = (input.orientation ?? 1) >= 5;
    if (!shouldSwapAxes) {
        return { width: input.width, height: input.height };
    }

    return { width: input.height, height: input.width };
}

export function createModelToImageTransform(params: {
    imageWidth: number;
    imageHeight: number;
    modelWidth: number;
    modelHeight: number;
}): ModelToImageTransform {
    const scale = Math.min(params.modelWidth / params.imageWidth, params.modelHeight / params.imageHeight);
    const contentWidth = params.imageWidth * scale;
    const contentHeight = params.imageHeight * scale;

    return {
        modelWidth: params.modelWidth,
        modelHeight: params.modelHeight,
        imageWidth: params.imageWidth,
        imageHeight: params.imageHeight,
        scale,
        padX: (params.modelWidth - contentWidth) / 2,
        padY: (params.modelHeight - contentHeight) / 2,
        contentWidth,
        contentHeight,
    };
}

function mapAxisFromModelToImage(
    start: number,
    end: number,
    padding: number,
    contentSize: number,
    modelSize: number,
): [number, number] {
    const modelStart = start * modelSize;
    const modelEnd = end * modelSize;
    const contentStart = (modelStart - padding) / contentSize;
    const contentEnd = (modelEnd - padding) / contentSize;
    return [clampUnit(contentStart), clampUnit(contentEnd)];
}

export function mapBoxFromModelToImage(
    box: [number, number, number, number],
    transform: ModelToImageTransform,
): [number, number, number, number] {
    const [x1, x2] = mapAxisFromModelToImage(
        box[0],
        box[2],
        transform.padX,
        transform.contentWidth,
        transform.modelWidth,
    );
    const [y1, y2] = mapAxisFromModelToImage(
        box[1],
        box[3],
        transform.padY,
        transform.contentHeight,
        transform.modelHeight,
    );

    return [x1, y1, x2, y2];
}

export function mapPointFromModelToImage(
    point: { x: number; y: number },
    transform: ModelToImageTransform,
): { x: number; y: number } {
    const [x] = mapAxisFromModelToImage(
        point.x,
        point.x,
        transform.padX,
        transform.contentWidth,
        transform.modelWidth,
    );
    const [y] = mapAxisFromModelToImage(
        point.y,
        point.y,
        transform.padY,
        transform.contentHeight,
        transform.modelHeight,
    );

    return { x, y };
}
