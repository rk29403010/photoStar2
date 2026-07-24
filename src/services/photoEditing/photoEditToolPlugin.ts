import type { CSSProperties, ComponentType } from 'react';
import type { Asset, PhotoEditOperation } from '../../boundary/contracts/core';

export type PhotoEditToolControl = { key: string; label: string; min: number; max: number; step: number };
export type PhotoEditToolCapabilities = {
    geometryChanges?: boolean;
    maskCompatible?: boolean;
    requiresSourceImage?: boolean;
    requiresAssetMetadata?: boolean;
};
export type PhotoEditToolControlProps = {
    asset?: Asset; operation: PhotoEditOperation; sourceUrl?: string | null;
    onCommit: (operation: PhotoEditOperation) => void; onPreviewChange: (operation: PhotoEditOperation) => void;
};
export type PhotoEditToolPreviewProps = PhotoEditToolControlProps & { previewUrl?: string | null; showWithoutChange: boolean };
export type PhotoEditToolRenderPipeline = { greyscale: () => PhotoEditToolRenderPipeline; png: () => { toBuffer: () => Promise<Buffer> } };
export type PhotoEditToolPlugin = {
    id: string; recipeVersion: number; label: string; icon: string; group: string;
    defaults: Record<string, number | boolean>; controls?: readonly PhotoEditToolControl[];
    validateOperation?: (operation: PhotoEditOperation) => void;
    Controls?: ComponentType<PhotoEditToolControlProps>;
    Overlay?: ComponentType<PhotoEditToolPreviewProps>;
    browserPreview?: (current: PhotoEditOperation, baseline: PhotoEditOperation) => CSSProperties | undefined;
    renderExact?: (input: Buffer, operation: PhotoEditOperation, pipeline: (input: Buffer) => PhotoEditToolRenderPipeline) => Promise<Buffer>;
    capabilities?: PhotoEditToolCapabilities;
    suggest?: (asset: Asset, analysis: unknown) => Partial<PhotoEditOperation['values']> | null;
    migrateOperation?: (operation: PhotoEditOperation, fromVersion: number) => PhotoEditOperation;
    help?: { description: string; accessibilityLabel: string };
    errorBoundaryDisplayName?: string;
};

function string(value: unknown, name: string): void { if (typeof value !== 'string' || !value.trim()) { throw new Error(`${name} must be a non-empty string`); } }
export function validatePhotoEditToolPlugin(plugin: PhotoEditToolPlugin): void {
    string(plugin?.id, 'photoEditToolPlugin.id'); string(plugin.label, 'photoEditToolPlugin.label'); string(plugin.icon, 'photoEditToolPlugin.icon'); string(plugin.group, 'photoEditToolPlugin.group');
    if (!Number.isInteger(plugin.recipeVersion) || plugin.recipeVersion < 1) { throw new Error('photoEditToolPlugin.recipeVersion must be a positive integer'); }
    if (!plugin.defaults || typeof plugin.defaults !== 'object') { throw new Error('photoEditToolPlugin.defaults must be an object'); }
    if (plugin.controls?.some((control) => !control.key || !control.label || control.min > control.max || control.step <= 0)) { throw new Error(`photoEditToolPlugin '${plugin.id}' has an invalid control`); }
    validateCallbacks(plugin);
}
function validateCallbacks(plugin: PhotoEditToolPlugin): void { for (const callback of [plugin.validateOperation, plugin.browserPreview, plugin.renderExact, plugin.suggest, plugin.migrateOperation]) { if (callback !== undefined && typeof callback !== 'function') { throw new TypeError(`photoEditToolPlugin '${plugin.id}' has an invalid callback`); } } }
