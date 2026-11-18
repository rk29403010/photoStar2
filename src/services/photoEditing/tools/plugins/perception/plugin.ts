import type { PhotoEditToolPlugin } from '../../../photoEditToolPlugin.ts';
import { PERCEPTION_CONTROLS, PERCEPTION_DEFAULTS } from './defaults.ts';
import { renderPerception } from './implementation.ts';

export const perceptionPlugin: PhotoEditToolPlugin = {
    id: 'perception',
    recipeVersion: 1,
    label: 'Perception',
    icon: 'ScanEye',
    group: 'effects',
    defaults: PERCEPTION_DEFAULTS,
    controls: PERCEPTION_CONTROLS,
    renderExact: renderPerception,
    capabilities: { maskCompatible: true },
    help: {
        description: 'Rebalances local adaptation and perceptual emphasis.',
        accessibilityLabel: 'Add perception adjustment',
    },
    errorBoundaryDisplayName: 'Perception',
};
