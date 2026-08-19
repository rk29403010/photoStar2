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

export function validateOverlayOperation(operation: PhotoEditOperation): void {
    if (operation.assetLayers === undefined) {return;}
    if (!Array.isArray(operation.assetLayers)) {throw new Error('Overlay photo layers must be an array');}
    const ids = new Set<string>();
    for (const layer of operation.assetLayers) {
        if (!layer.id || ids.has(layer.id)) {throw new Error('Each overlay layer must have a unique id');}
        if (!layer.assetId) {throw new Error('Each overlay layer must reference a library asset');}
        ids.add(layer.id);
        const opacity = finite(layer.opacity, 'Overlay opacity');
        const offsetX = finite(layer.offsetX, 'Overlay horizontal position');
        const offsetY = finite(layer.offsetY, 'Overlay vertical position');
        const scale = finite(layer.scale, 'Overlay scale');
        if (opacity < 0 || opacity > 1) {throw new Error('Overlay opacity must be between 0 and 1');}
        if (scale < 0.05 || scale > 8) {throw new Error('Overlay scale must be between 5% and 800%');}
        if (Math.abs(offsetX) > 4 || Math.abs(offsetY) > 4) {throw new Error('Overlay position is outside the supported canvas range');}
    }
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
    return {
        input: await pipeline.png().toBuffer(),
        left: destinationLeft,
        top: destinationTop,
        blend: 'over',
    };
}

export async function renderOverlay(
    input: Buffer,
    operation: PhotoEditOperation,
    _pipeline: (input: Buffer) => PhotoEditToolRenderPipeline,
    context: PhotoEditToolRenderContext,
): Promise<Buffer> {
    const layers = operation.assetLayers ?? [];
    if (layers.length === 0) {return input;}
    if (!context.resolveAssetSource) {throw new Error('Overlay photos requires access to library source images');}

    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) {return input;}
    const composites: CompositeInput[] = [];
    for (const layer of layers) {
        if (!layer.enabled || layer.opacity <= 0) {continue;}
        const source = await context.resolveAssetSource(layer.assetId);
        const prepared = await prepareLayer(source, layer, metadata.width, metadata.height);
        if (prepared) {composites.push(prepared);}
    }
    if (composites.length === 0) {return input;}
    return sharp(input).ensureAlpha().composite(composites).png().toBuffer();
}
