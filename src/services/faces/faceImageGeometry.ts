type DimensionsInput = {
    width?: number | null | undefined;
    height?: number | null | undefined;
    orientation?: number | null | undefined;
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
