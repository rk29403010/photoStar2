import type { CSSProperties } from 'react';
import type { Asset, PhotoEditOperation } from '../../boundary/contracts/core';
import type { AutomaticPhotoAnalysis, AutomaticPhotoContext } from '../../shared/photoEditing/automatic.ts';

export type PhotoEditToolControl = { key: string; label: string; min: number; max: number; step: number };
export type PhotoEditToolCapabilities = {
    geometryChanges?: boolean;
    maskCompatible?: boolean;
    requiresSourceImage?: boolean;
    requiresAssetMetadata?: boolean;
};
export type PhotoEditToolRenderPipeline = { greyscale: () => PhotoEditToolRenderPipeline; png: () => { toBuffer: () => Promise<Buffer> } };
export type PhotoEditToolBrowserPreviewPlugin = Pick<PhotoEditToolPlugin, 'id' | 'browserPreview'> & {
    browserPreview: NonNullable<PhotoEditToolPlugin['browserPreview']>;
};
export type PhotoEditAutomaticSuggestion = {
    id: string;
    label: string;
    name: string;
    rationale: string;
    confidence: number;
    values: Record<string, number | boolean>;
    /** Suggestions that use face, frame, or subject coordinates opt out after geometry edits. */
    requiresSemanticGeometry?: boolean;
    /** Defaults to updating the most recent operation for this plug-in. */
    operationPolicy?: 'append' | 'update-latest';
    /** Lower values are presented first; ties preserve generated registry order. */
    order?: number;
    recipeVersion?: number;
};
export type PhotoEditAutomaticSuggestionContext = {
    asset: Asset;
    analysis: AutomaticPhotoAnalysis;
    context: AutomaticPhotoContext;
    semanticGeometrySafe: boolean;
};
export type PhotoEditToolPlugin = {
    id: string; recipeVersion: number; label: string; icon: string; group: string;
    defaults: Record<string, number | boolean>; controls?: readonly PhotoEditToolControl[];
    validateOperation?: (operation: PhotoEditOperation) => void;
    browserPreview?: (current: PhotoEditOperation, baseline: PhotoEditOperation) => CSSProperties | undefined;
    renderExact?: (input: Buffer, operation: PhotoEditOperation, pipeline: (input: Buffer) => PhotoEditToolRenderPipeline) => Promise<Buffer>;
    capabilities?: PhotoEditToolCapabilities;
    suggest?: (context: PhotoEditAutomaticSuggestionContext) => PhotoEditAutomaticSuggestion | null;
    migrateOperation?: (operation: PhotoEditOperation, fromVersion: number) => PhotoEditOperation;
    help?: { description: string; accessibilityLabel: string };
    errorBoundaryDisplayName?: string;
};

function string(value: unknown, name: string): void { if (typeof value !== 'string' || !value.trim()) { throw new Error(`${name} must be a non-empty string`); } }
export function validatePhotoEditToolPlugin(plugin: PhotoEditToolPlugin): void {
    string(plugin?.id, 'photoEditToolPlugin.id'); string(plugin.label, 'photoEditToolPlugin.label'); string(plugin.icon, 'photoEditToolPlugin.icon'); string(plugin.group, 'photoEditToolPlugin.group');
    validateRecipe(plugin); validateControls(plugin); validateCapabilities(plugin);
    validateCallbacks(plugin);
}
function validateRecipe(plugin: PhotoEditToolPlugin): void { if (!Number.isInteger(plugin.recipeVersion) || plugin.recipeVersion < 1) { throw new Error('photoEditToolPlugin.recipeVersion must be a positive integer'); } if (!plugin.defaults || typeof plugin.defaults !== 'object') { throw new Error('photoEditToolPlugin.defaults must be an object'); } }
function validateControls(plugin: PhotoEditToolPlugin): void { if (plugin.controls?.some((control) => !control.key || !control.label || control.min > control.max || control.step <= 0)) { throw new Error(`photoEditToolPlugin '${plugin.id}' has an invalid control`); } }
function validateCapabilities(plugin: PhotoEditToolPlugin): void { for (const value of Object.values(plugin.capabilities ?? {})) { if (typeof value !== 'boolean') { throw new Error(`photoEditToolPlugin '${plugin.id}' has invalid capabilities`); } } }
function validateCallbacks(plugin: PhotoEditToolPlugin): void { for (const callback of [plugin.validateOperation, plugin.browserPreview, plugin.renderExact, plugin.suggest, plugin.migrateOperation]) { if (callback !== undefined && typeof callback !== 'function') { throw new TypeError(`photoEditToolPlugin '${plugin.id}' has an invalid callback`); } } }
