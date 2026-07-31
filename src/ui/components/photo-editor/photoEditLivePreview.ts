import type { PhotoEditOperation } from '@contracts/core';
import { generatedPhotoEditToolBrowserPreviewPlugins } from './generatedPhotoEditToolBrowserPreviewRegistry.ts';

export function getLivePreviewStyle(current: PhotoEditOperation, baseline: PhotoEditOperation) {
    if (current.id !== baseline.id || current.tool !== baseline.tool || current.maskId) {return undefined;}
    const plugin = generatedPhotoEditToolBrowserPreviewPlugins.find((candidate) => candidate.id === current.tool);
    return plugin?.browserPreview?.(current, baseline);
}
