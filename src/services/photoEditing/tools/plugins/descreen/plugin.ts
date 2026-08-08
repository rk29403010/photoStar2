import type { PhotoEditToolPlugin } from '../../../photoEditToolPlugin.ts';
import { renderDescreen } from './implementation.ts';

export const descreenPlugin: PhotoEditToolPlugin = {
    id: 'descreen',
    recipeVersion: 1,
    label: 'Descreen print texture',
    icon: 'Sparkles',
    group: 'restore',
    defaults: { strength: 0.98, minPeriodPx: 6, maxPeriodPx: 40, notchWidthFraction: 0.04, sharpenAmount: 0.2, force: false },
    controls: [
        { key: 'strength', label: 'Texture removal', min: 0, max: 1, step: 0.01 },
        { key: 'minPeriodPx', label: 'Smallest pattern', min: 2, max: 40, step: 1 },
        { key: 'maxPeriodPx', label: 'Largest pattern', min: 10, max: 160, step: 1 },
        { key: 'sharpenAmount', label: 'Detail recovery', min: 0, max: 0.8, step: 0.05 },
    ],
    renderExact: renderDescreen,
    capabilities: { maskCompatible: true, requiresSourceImage: true },
    help: {
        description: 'Detects and removes regular print-screen or photographic-paper texture using Fourier notch filtering.',
        accessibilityLabel: 'Remove regular print texture',
    },
    errorBoundaryDisplayName: 'Descreen print texture',
};
