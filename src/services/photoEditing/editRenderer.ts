import sharp from 'sharp';
import type { PhotoEditMask, PhotoEditOperation } from '../../boundary/contracts/photoEditor';
import { applyColourPopPixels } from '../../shared/photoEditing/colourPop.ts';

type RenderOptions = {
    maxWidth?: number;
};

type FilterTool = Exclude<PhotoEditOperation['tool'], 'colour_pop' | 'crop' | 'dehaze' | 'rotate'>;
type FilterPipeline = ReturnType<typeof sharp>;
type FilterHandler = (pipeline: FilterPipeline, operation: PhotoEditOperation) => FilterPipeline;
type RawImage = { data: Buffer; width: number; height: number };
const ROTATION_FILL = { transparent: 0, black: 1, white: 2 } as const;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function numberValue(operation: PhotoEditOperation, key: string, fallback: number): number {
    const value = operation.values[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(operation: PhotoEditOperation, key: string, fallback: boolean): boolean {
    const value = operation.values[key];
    return typeof value === 'boolean' ? value : fallback;
}

type RotationPlacement = { height: number; left: number; top: number; width: number };

function rotationPlacement(params: {
    angle: number;
    expandCanvas: boolean;
    height: number;
    pivotX: number;
    pivotY: number;
    rotatedHeight: number;
    rotatedWidth: number;
    width: number;
}): RotationPlacement {
    const radians = params.angle * Math.PI / 180;
    const centreX = params.width / 2;
    const centreY = params.height / 2;
    const pivotX = params.pivotX * params.width;
    const pivotY = params.pivotY * params.height;
    const deltaX = centreX - pivotX;
    const deltaY = centreY - pivotY;
    const rotatedCentreX = pivotX + (deltaX * Math.cos(radians)) - (deltaY * Math.sin(radians));
    const rotatedCentreY = pivotY + (deltaX * Math.sin(radians)) + (deltaY * Math.cos(radians));
    const left = rotatedCentreX - params.rotatedWidth / 2;
    const top = rotatedCentreY - params.rotatedHeight / 2;
    if (!params.expandCanvas) {
        return { height: params.height, left: Math.round(left), top: Math.round(top), width: params.width };
    }
    const minX = Math.min(0, left);
    const minY = Math.min(0, top);
    const maxX = Math.max(params.width, left + params.rotatedWidth);
    const maxY = Math.max(params.height, top + params.rotatedHeight);
    return {
        height: Math.ceil(maxY - minY),
        left: Math.round(left - minX),
        top: Math.round(top - minY),
        width: Math.ceil(maxX - minX),
    };
}

function rotationBackground(operation: PhotoEditOperation): { alpha: number; b: number; g: number; r: number } {
    const fillMode = Math.round(numberValue(operation, 'fillMode', ROTATION_FILL.transparent));
    if (fillMode === ROTATION_FILL.black) {return { r: 0, g: 0, b: 0, alpha: 1 };}
    if (fillMode === ROTATION_FILL.white) {return { r: 255, g: 255, b: 255, alpha: 1 };}
    return { r: 0, g: 0, b: 0, alpha: 0 };
}

async function clippedRotationOverlay(params: {
    data: Buffer;
    destinationHeight: number;
    destinationWidth: number;
    height: number;
    left: number;
    top: number;
    width: number;
}): Promise<{ data: Buffer; left: number; top: number } | null> {
    const sourceLeft = Math.max(0, -params.left);
    const sourceTop = Math.max(0, -params.top);
    const left = Math.max(0, params.left);
    const top = Math.max(0, params.top);
    const width = Math.min(params.width - sourceLeft, params.destinationWidth - left);
    const height = Math.min(params.height - sourceTop, params.destinationHeight - top);
    if (width <= 0 || height <= 0) {return null;}
    if (sourceLeft === 0 && sourceTop === 0 && width === params.width && height === params.height) {
        return { data: params.data, left, top };
    }
    const data = await sharp(params.data).extract({ left: sourceLeft, top: sourceTop, width, height }).png().toBuffer();
    return { data, left, top };
}

async function applyRotation(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> {
    const angle = numberValue(operation, 'angle', 0);
    const flipHorizontal = booleanValue(operation, 'flipHorizontal', false);
    const flipVertical = booleanValue(operation, 'flipVertical', false);
    if (Math.abs(angle % 360) < 0.000_001 && !flipHorizontal && !flipVertical) {return input;}
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) {return input;}
    let transform = sharp(input);
    if (flipVertical) {transform = transform.flip();}
    if (flipHorizontal) {transform = transform.flop();}
    const rotated = await transform
        .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer({ resolveWithObject: true });
    const placement = rotationPlacement({
        angle,
        expandCanvas: booleanValue(operation, 'expandCanvas', true),
        height: metadata.height,
        pivotX: clamp(numberValue(operation, 'pivotX', 0.5), 0, 1),
        pivotY: clamp(numberValue(operation, 'pivotY', 0.5), 0, 1),
        rotatedHeight: rotated.info.height,
        rotatedWidth: rotated.info.width,
        width: metadata.width,
    });
    const overlay = await clippedRotationOverlay({
        data: rotated.data,
        destinationHeight: placement.height,
        destinationWidth: placement.width,
        height: rotated.info.height,
        left: placement.left,
        top: placement.top,
        width: rotated.info.width,
    });
    const canvas = sharp({ create: { width: placement.width, height: placement.height, channels: 4, background: rotationBackground(operation) } });
    return overlay ? canvas.composite([{ input: overlay.data, left: overlay.left, top: overlay.top }]).png().toBuffer() : canvas.png().toBuffer();
}

async function decodeRgba(input: Buffer): Promise<RawImage> {
    const { data, info } = await sharp(input)
        .toColourspace('srgb')
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}

function encodeRgba(image: RawImage): Promise<Buffer> {
    return sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer();
}

function pushHorizontalCandidate(params: {
    source: Float32Array;
    row: number;
    deque: Int32Array;
    head: number;
    tail: number;
    index: number;
}): number {
    const { source, row, deque, head, index } = params;
    let tail = params.tail;
    while (tail > head && source[row + deque[tail - 1]] >= source[row + index]) {tail -= 1;}
    deque[tail] = index;
    return tail + 1;
}

function pushVerticalCandidate(params: {
    source: Float32Array;
    width: number;
    x: number;
    deque: Int32Array;
    head: number;
    tail: number;
    index: number;
}): number {
    const { source, width, x, deque, head, index } = params;
    let tail = params.tail;
    while (tail > head && source[deque[tail - 1] * width + x] >= source[index * width + x]) {tail -= 1;}
    deque[tail] = index;
    return tail + 1;
}

function horizontalMinimum(source: Float32Array, width: number, height: number, radius: number): Float32Array {
    const output = new Float32Array(source.length);
    const deque = new Int32Array(width);
    for (let y = 0; y < height; y += 1) {
        const row = y * width;
        let head = 0;
        let tail = 0;
        let next = 0;
        for (let x = 0; x < width; x += 1) {
            const right = Math.min(width - 1, x + radius);
            while (next <= right) {
                tail = pushHorizontalCandidate({ source, row, deque, head, tail, index: next });
                next += 1;
            }
            const left = Math.max(0, x - radius);
            while (tail > head && deque[head] < left) {head += 1;}
            output[row + x] = source[row + deque[head]];
        }
    }
    return output;
}

function verticalMinimum(source: Float32Array, width: number, height: number, radius: number): Float32Array {
    const output = new Float32Array(source.length);
    const deque = new Int32Array(height);
    for (let x = 0; x < width; x += 1) {
        let head = 0;
        let tail = 0;
        let next = 0;
        for (let y = 0; y < height; y += 1) {
            const bottom = Math.min(height - 1, y + radius);
            while (next <= bottom) {
                tail = pushVerticalCandidate({ source, width, x, deque, head, tail, index: next });
                next += 1;
            }
            const top = Math.max(0, y - radius);
            while (tail > head && deque[head] < top) {head += 1;}
            output[y * width + x] = source[deque[head] * width + x];
        }
    }
    return output;
}

function minimumFilter(source: Float32Array, width: number, height: number, radius: number): Float32Array {
    return verticalMinimum(horizontalMinimum(source, width, height, radius), width, height, radius);
}

function minimumRgb(data: Buffer, atmosphere?: readonly number[]): Float32Array {
    const output = new Float32Array(data.length / 4);
    for (let pixel = 0; pixel < output.length; pixel += 1) {
        const offset = pixel * 4;
        const red = data[offset] / 255 / (atmosphere?.[0] ?? 1);
        const green = data[offset + 1] / 255 / (atmosphere?.[1] ?? 1);
        const blue = data[offset + 2] / 255 / (atmosphere?.[2] ?? 1);
        output[pixel] = Math.min(red, green, blue);
    }
    return output;
}

function estimateAtmosphere(data: Buffer, darkChannel: Float32Array): readonly number[] {
    const stride = Math.max(1, Math.ceil(darkChannel.length / 4096));
    const candidates: number[] = [];
    for (let pixel = 0; pixel < darkChannel.length; pixel += stride) {
        if (data[pixel * 4 + 3] > 0) {candidates.push(pixel);}
    }
    candidates.sort((left, right) => darkChannel[right] - darkChannel[left]);
    const candidateCount = Math.min(32, candidates.length);
    let brightest = candidates[0] ?? 0;
    let brightestLuma = -1;
    for (const pixel of candidates.slice(0, candidateCount)) {
        const offset = pixel * 4;
        const luma = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
        if (luma > brightestLuma) {
            brightest = pixel;
            brightestLuma = luma;
        }
    }
    const offset = brightest * 4;
    return [Math.max(0.1, data[offset] / 255), Math.max(0.1, data[offset + 1] / 255), Math.max(0.1, data[offset + 2] / 255)];
}

function recoverDehazedPixels(image: RawImage, atmosphere: readonly number[], transmission: Float32Array, strength: number): Buffer {
    const output = Buffer.from(image.data);
    for (let pixel = 0; pixel < transmission.length; pixel += 1) {
        const offset = pixel * 4;
        const transmissionValue = Math.max(0.3, transmission[pixel]);
        for (let channel = 0; channel < 3; channel += 1) {
            const source = image.data[offset + channel] / 255;
            const recovered = (source - atmosphere[channel]) / transmissionValue + atmosphere[channel];
            output[offset + channel] = Math.round(clamp(source + strength * (recovered - source), 0, 1) * 255);
        }
    }
    return output;
}

async function applyDehaze(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> {
    const strength = clamp(numberValue(operation, 'strength', 0.45), 0, 1);
    if (strength === 0) {return input;}
    const radiusPercent = clamp(numberValue(operation, 'radiusPercent', 1.5), 0.5, 3);
    const image = await decodeRgba(input);
    const radius = clamp(Math.round(Math.min(image.width, image.height) * radiusPercent / 100), 1, 63);
    const darkChannel = minimumFilter(minimumRgb(image.data), image.width, image.height, radius);
    const atmosphere = estimateAtmosphere(image.data, darkChannel);
    const normalizedDark = minimumFilter(minimumRgb(image.data, atmosphere), image.width, image.height, radius);
    const transmission = normalizedDark.map((value) => clamp(1 - 0.92 * value, 0.3, 1));
    return encodeRgba({ ...image, data: recoverDehazedPixels(image, atmosphere, transmission, strength) });
}

async function applyColourPop(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> {
    const image = await decodeRgba(input);
    return encodeRgba({ ...image, data: Buffer.from(applyColourPopPixels(image.data, operation.values)) });
}

async function applyCrop(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> {
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) {return input;}
    const x = clamp(numberValue(operation, 'x', 0), 0, 0.99);
    const y = clamp(numberValue(operation, 'y', 0), 0, 0.99);
    const left = Math.round(x * metadata.width);
    const top = Math.round(y * metadata.height);
    const width = Math.max(1, Math.min(Math.round(clamp(numberValue(operation, 'width', 1), 0.01, 1) * metadata.width), metadata.width - left));
    const height = Math.max(1, Math.min(Math.round(clamp(numberValue(operation, 'height', 1), 0.01, 1) * metadata.height), metadata.height - top));
    return sharp(input).extract({ left, top, width, height }).png().toBuffer();
}

function applyAdjust(pipeline: FilterPipeline, operation: PhotoEditOperation): FilterPipeline {
    const contrast = clamp(numberValue(operation, 'contrast', 0), -1, 1);
    const multiplier = 1 + contrast;
    return pipeline
        .linear(multiplier, 128 * (1 - multiplier))
        .modulate({
            brightness: clamp(numberValue(operation, 'brightness', 1), 0.1, 3),
            saturation: clamp(numberValue(operation, 'saturation', 1), 0, 3),
            hue: clamp(numberValue(operation, 'hue', 0), -180, 180),
        });
}

function applyRestore(pipeline: FilterPipeline, operation: PhotoEditOperation): FilterPipeline {
    const contrast = clamp(numberValue(operation, 'contrast', 0.12), -0.5, 1);
    const multiplier = 1 + contrast;
    return pipeline
        .median(Math.round(clamp(numberValue(operation, 'denoise', 1), 1, 5)))
        .linear(multiplier, 128 * (1 - multiplier))
        .modulate({
            brightness: clamp(numberValue(operation, 'fadeRecovery', 1.08), 0.5, 2),
            saturation: clamp(numberValue(operation, 'saturation', 1.08), 0, 2),
        })
        .sharpen({ sigma: clamp(numberValue(operation, 'detail', 0.8), 0.01, 5) });
}

const FILTER_HANDLERS: Record<FilterTool, FilterHandler> = {
    adjust: applyAdjust,
    blur: (pipeline, operation) => pipeline.blur(clamp(numberValue(operation, 'sigma', 2), 0.3, 100)),
    grayscale: (pipeline) => pipeline.greyscale(),
    restore: applyRestore,
    sharpen: (pipeline, operation) => pipeline.sharpen({ sigma: clamp(numberValue(operation, 'sigma', 1), 0.01, 10) }),
};

async function applyOperation(input: Buffer, operation: PhotoEditOperation): Promise<Buffer> {
    if (operation.tool === 'crop') {return applyCrop(input, operation);}
    if (operation.tool === 'rotate') {
        return applyRotation(input, operation);
    }
    if (operation.tool === 'dehaze') {return applyDehaze(input, operation);}
    if (operation.tool === 'colour_pop') {return applyColourPop(input, operation);}

    return FILTER_HANDLERS[operation.tool](sharp(input), operation).png().toBuffer();
}

function shapeMarkup(mask: PhotoEditMask, width: number, height: number, fill: string): string {
    const box = mask.box ?? { x: 0.2, y: 0.15, width: 0.6, height: 0.7 };
    if (mask.kind === 'polygon' && mask.points && mask.points.length >= 3) {
        const points = mask.points.map((point) => `${point.x * width},${point.y * height}`).join(' ');
        return `<polygon points="${points}" fill="${fill}"/>`;
    }
    const x = box.x * width;
    const y = box.y * height;
    const boxWidth = box.width * width;
    const boxHeight = box.height * height;
    if (mask.kind === 'ellipse' || mask.kind === 'subject') {
        return `<ellipse cx="${x + boxWidth / 2}" cy="${y + boxHeight / 2}" rx="${boxWidth / 2}" ry="${boxHeight / 2}" fill="${fill}"/>`;
    }
    return `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="2" fill="${fill}"/>`;
}

function buildMaskSvg(mask: PhotoEditMask, width: number, height: number): Buffer {
    const isInverted = Boolean(mask.inverted) !== (mask.kind === 'background');
    const blur = clamp(mask.feather, 0, 0.25) * Math.min(width, height);
    const filter = blur > 0 ? `<filter id="f"><feGaussianBlur stdDeviation="${blur}"/></filter>` : '';
    const filterAttribute = blur > 0 ? ' filter="url(#f)"' : '';
    const normalMask = `<g${filterAttribute}>${shapeMarkup(mask, width, height, 'white')}</g>`;
    const invertedMask = `<mask id="m"><rect width="100%" height="100%" fill="white"/><g${filterAttribute}>${shapeMarkup(mask, width, height, 'black')}</g></mask><rect width="100%" height="100%" fill="white" mask="url(#m)"/>`;
    return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs>${filter}</defs>${isInverted ? invertedMask : normalMask}</svg>`);
}

async function applyMaskedOperation(input: Buffer, operation: PhotoEditOperation, mask: PhotoEditMask): Promise<Buffer> {
    const edited = await applyOperation(input, operation);
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) {return edited;}
    const maskedEdit = await sharp(edited)
        .ensureAlpha()
        .composite([{ input: buildMaskSvg(mask, metadata.width, metadata.height), blend: 'dest-in' }])
        .png()
        .toBuffer();
    return sharp(input).ensureAlpha().composite([{ input: maskedEdit, blend: 'over' }]).png().toBuffer();
}

export async function renderPhotoEdit(
    source: string | Buffer,
    operations: PhotoEditOperation[],
    masks: PhotoEditMask[],
    options: RenderOptions = {},
): Promise<Buffer> {
    const sourcePipeline = sharp(source).rotate();
    if (options.maxWidth) {
        sourcePipeline.resize(options.maxWidth, null, { fit: 'inside', withoutEnlargement: true });
    }
    let current = await sourcePipeline.png().toBuffer();
    const masksById = new Map(masks.map((mask) => [mask.id, mask]));
    for (const operation of operations) {
        if (!operation.enabled) {continue;}
        const mask = operation.maskId ? masksById.get(operation.maskId) : undefined;
        current = mask && operation.tool !== 'crop' && operation.tool !== 'rotate'
            ? await applyMaskedOperation(current, operation, mask)
            : await applyOperation(current, operation);
    }
    return current;
}
