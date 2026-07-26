import type { PhotoEditToolRenderPipeline } from '../../../photoEditToolPlugin.ts';

export function renderGrayscale(input: Buffer, pipeline: (input: Buffer) => PhotoEditToolRenderPipeline): Promise<Buffer> {
    return pipeline(input).greyscale().png().toBuffer();
}
