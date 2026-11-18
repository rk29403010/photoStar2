import type { PhotoEditToolPlugin } from '../../../photoEditToolPlugin.ts';
import { renderOverlay, validateOverlayOperation } from './implementation.ts';

export const overlayPlugin: PhotoEditToolPlugin = {
    id: 'overlay',
    recipeVersion: 1,
    label: 'Overlay photos',
    icon: 'Blend',
    group: 'compose',
    defaults: {},
    controls: [],
    validateOperation: validateOverlayOperation,
    renderExact: renderOverlay,
    capabilities: { maskCompatible: false, requiresSourceImage: true },
    help: {
        description: 'Combines additional library photos with independent position, scale and opacity.',
        accessibilityLabel: 'Add photo overlay',
    },
    errorBoundaryDisplayName: 'Overlay photos',
};

export default overlayPlugin;
