import type { PhotoEditOperation } from '@contracts/core';
import { generatedPhotoEditToolPlugins } from '../../../services/photoEditing/generatedPhotoEditToolPluginRegistry.ts';

export function getLivePreviewStyle(current: PhotoEditOperation, baseline: PhotoEditOperation) {
    if (current.id !== baseline.id || current.tool !== baseline.tool || current.maskId) {return undefined;}
    const plugin = generatedPhotoEditToolPlugins.find((candidate) => candidate.id === current.tool);
    return plugin?.browserPreview?.(current, baseline);
}
