import { PERCEPTION_CONTROLS, PERCEPTION_DEFAULTS } from './defaults.ts';

export const perceptionBrowserManifest = {
    id: 'perception',
    recipeVersion: 1,
    label: 'Perception',
    icon: 'Eye',
    group: 'effects',
    defaults: PERCEPTION_DEFAULTS,
    controls: PERCEPTION_CONTROLS,
    capabilities: { maskCompatible: true },
    help: {
        description: 'Rebalances local adaptation and perceptual emphasis.',
        accessibilityLabel: 'Add perception adjustment',
    },
    errorBoundaryDisplayName: 'Perception',
};
