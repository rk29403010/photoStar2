import sharp from 'sharp';
import type { PhotoEditAssetLayer, PhotoEditOperation } from '../../../../../boundary/contracts/photoEditor.ts';
import type { PhotoEditToolRenderContext, PhotoEditToolRenderPipeline } from '../../../photoEditToolPlugin.ts';

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {throw new Error(`${name} must be a finite number`);}
    return value;
}

function assertRange(value: unknown, name: string, minimum: number, maximum: number, message: string): void {
    const numeric = finite(value, name);
    if (numeric < minimum || numeric > maximum) {throw new Error(message);}
}

function assertLayerIdentity(layer: PhotoEditAssetLayer, ids: Set<string>): void {
    if (!layer.id || ids.has(layer.id)) {throw new Error('Each overlay layer must have a unique id');}
    if (!layer.assetId) {throw new Error('Each overlay layer must reference a library asset');}
    ids.add(layer.id);
}

function validateLayer(layer: PhotoEditAssetLayer, ids: Set<string>): void {
    assertLayerIdentity(layer, ids);
    assertRange(layer.opacity, 'Overlay opacity', 0, 1, 'Overlay opacity must be between 0 and 1');
    assertRange(layer.scale, 'Overlay scale', 0.05, 8, 'Overlay scale must be between 5% and 800%');
    const offsetX = finite(layer.offsetX, 'Overlay horizontal position');
    const offsetY = finite(layer.offsetY, 'Overlay vertical position');
    if (Math.abs(offsetX) > 4 || Math.abs(offsetY) > 4) {throw new Error('Overlay position is outside the supported canvas range');}
}

export function validateOverlayOperation(operation: PhotoEditOperation): void {
    if (operation.assetLayers === undefined) {return;}
    if (!Array.isArray(operation.assetLayers)) {throw new Error('Overlay photo layers must be an array');}
    const ids = new Set<string>();
    operation.assetLayers.forEach((layer) => validateLayer(layer, ids));
}

type CompositeInput = {
    input: Buffer;
    left: number;
    top: number;
    blend: 'over';
};

async function prepareLayer(
    source: string | Buffer,
    layer: PhotoEditAssetLayer,
    canvasWidth: number,
    canvasHeight: number,
): Promise<CompositeInput | null> {
    const scale = clamp(layer.scale, 0.05, 8);
    const resized = await sharp(source)
        .rotate()
        .resize(Math.max(1, Math.round(canvasWidth * scale)), Math.max(1, Math.round(canvasHeight * scale)), { fit: 'inside' })
        .ensureAlpha()
        .png()
        .toBuffer({ resolveWithObject: true });
    const targetWidth = resized.info.width;
    const targetHeight = resized.info.height;
    const left = Math.round((canvasWidth - targetWidth) / 2 + layer.offsetX * canvasWidth);
    const top = Math.round((canvasHeight - targetHeight) / 2 + layer.offsetY * canvasHeight);

    const sourceLeft = Math.max(0, -left);
    const sourceTop = Math.max(0, -top);
    const destinationLeft = Math.max(0, left);
    const destinationTop = Math.max(0, top);
    const visibleWidth = Math.min(targetWidth - sourceLeft, canvasWidth - destinationLeft);
    const visibleHeight = Math.min(targetHeight - sourceTop, canvasHeight - destinationTop);
    if (visibleWidth <= 0 || visibleHeight <= 0) {return null;}

    let pipeline = sharp(resized.data);
    if (sourceLeft > 0 || sourceTop > 0 || visibleWidth !== targetWidth || visibleHeight !== targetHeight) {
        pipeline = pipeline.extract({ left: sourceLeft, top: sourceTop, width: visibleWidth, height: visibleHeight });
    }
    const opacity = clamp(layer.opacity, 0, 1);
    if (opacity < 0.999) {
        pipeline = pipeline.composite([{
            input: {
                create: {
                    width: visibleWidth,
                    height: visibleHeight,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: opacity },
                },
            },
            blend: 'dest-in',
        }]);
    }
    return { input: await pipeline.png().toBuffer(), left: destinationLeft, top: destinationTop, blend: 'over' };
}

function activeLayers(layers: PhotoEditAssetLayer[]): PhotoEditAssetLayer[] {
    return layers.filter((layer) => layer.enabled && layer.opacity > 0);
}

function isComposite(value: CompositeInput | null): value is CompositeInput {
    return value !== null;
}

async function prepareComposites(
    layers: PhotoEditAssetLayer[],
    resolveAssetSource: NonNullable<PhotoEditToolRenderContext['resolveAssetSource']>,
    width: number,
    height: number,
): Promise<CompositeInput[]> {
    const prepared = await Promise.all(layers.map(async (layer) => {
        const source = await resolveAssetSource(layer.assetId);
        return prepareLayer(source, layer, width, height);
    }));
    return prepared.filter(isComposite);
}

export async function renderOverlay(
    input: Buffer,
    operation: PhotoEditOperation,
    _pipeline: (input: Buffer) => PhotoEditToolRenderPipeline,
    context: PhotoEditToolRenderContext,
): Promise<Buffer> {
    const layers = activeLayers(operation.assetLayers ?? []);
    if (layers.length === 0) {return input;}
    const resolveAssetSource = context.resolveAssetSource;
    if (!resolveAssetSource) {throw new Error('Overlay photos requires access to library source images');}
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) {return input;}
    const composites = await prepareComposites(layers, resolveAssetSource, metadata.width, metadata.height);
    if (composites.length === 0) {return input;}
    return sharp(input).ensureAlpha().composite(composites).png().toBuffer();
}
