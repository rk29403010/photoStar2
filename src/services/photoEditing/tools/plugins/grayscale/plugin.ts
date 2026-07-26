import type { PhotoEditToolPlugin } from '../../../photoEditToolPlugin.ts';
import { renderGrayscale } from './implementation.ts';

export const grayscalePlugin: PhotoEditToolPlugin = {
    id: 'grayscale', recipeVersion: 1, label: 'Black & white', icon: 'Contrast', group: 'colour', defaults: {},
    capabilities: { maskCompatible: true },
    validateOperation(operation) { if (Object.keys(operation.values).length !== 0) { throw new Error('grayscale does not accept values'); } },
    browserPreview: () => ({ filter: 'grayscale(1)' }),
    renderExact(input, _operation, pipeline) { return renderGrayscale(input, pipeline); },
    help: { description: 'Converts the image to black and white.', accessibilityLabel: 'Add black and white' }, errorBoundaryDisplayName: 'Black & white',
};
