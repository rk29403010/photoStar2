import type { PhotoEditToolControl } from '../../../photoEditToolPlugin.ts';

export const PERCEPTION_DEFAULTS: Record<string, number | boolean> = {
    strength: 55,
    localAdaptation: 65,
    emphasis: 0,
    suppression: 0,
    colourConstancy: 20,
};

export const PERCEPTION_CONTROLS: readonly PhotoEditToolControl[] = [
    { key: 'strength', label: 'Strength', min: 0, max: 100, step: 1 },
    { key: 'localAdaptation', label: 'Local adaptation', min: 0, max: 100, step: 1 },
    { key: 'emphasis', label: 'Emphasis', min: 0, max: 100, step: 1 },
    { key: 'suppression', label: 'Suppression', min: 0, max: 100, step: 1 },
    { key: 'colourConstancy', label: 'Colour constancy', min: 0, max: 100, step: 1 },
];
