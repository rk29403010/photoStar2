import { Aperture, Blend, CloudSun, Contrast, Crop, Eye, Focus, ImageUp, Palette, RotateCw, ScanEye, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PhotoEditOperation, PhotoEditTool } from '@contracts/core';
import { perceptionBrowserManifest } from '../../../services/photoEditing/tools/plugins/perception/browserManifest.ts';
import { generatedPhotoEditToolBrowserManifests } from './generatedPhotoEditToolBrowserManifestRegistry.ts';
import type { PhotoEditToolBrowserManifest } from './generatedPhotoEditToolBrowserManifestRegistry.ts';
import { generatedPhotoEditToolUiPlugins } from './generatedPhotoEditToolUiRegistry.ts';
import type { PhotoEditToolUiPlugin } from './photoEditToolUiRegistry.ts';

export type ToolDefinition = { id: PhotoEditTool; label: string; icon: LucideIcon; defaults: Record<string, number | boolean>; controls: Array<{ key: string; label: string; min: number; max: number; step: number; }>; };
const ICONS: Record<string, LucideIcon> = { Aperture, Blend, CloudSun, Contrast, Crop, Eye, Focus, ImageUp, Palette, ScanEye, RotateCw, SlidersHorizontal, Sparkles };
const browserManifests = new Map<string, PhotoEditToolBrowserManifest>();
const browserManifestEntries: readonly PhotoEditToolBrowserManifest[] = [...generatedPhotoEditToolBrowserManifests, perceptionBrowserManifest];
for (const manifest of browserManifestEntries) {
    if (browserManifests.has(manifest.id)) { throw new Error(`duplicate photo edit tool browser manifest '${manifest.id}'`); }
    browserManifests.set(manifest.id, manifest);
}
const uiPlugins = new Map<string, PhotoEditToolUiPlugin>();
for (const plugin of generatedPhotoEditToolUiPlugins) {
    if (!browserManifests.has(plugin.id) || uiPlugins.has(plugin.id)) { throw new Error(`invalid photo edit tool UI plug-in '${plugin.id}'`); }
    uiPlugins.set(plugin.id, plugin);
}
function definitionFromPlugin(plugin: PhotoEditToolBrowserManifest): ToolDefinition { const icon = ICONS[plugin.icon]; if (!icon) { throw new Error(`photo edit tool '${plugin.id}' references unknown icon '${plugin.icon}'`); } return { id: plugin.id, label: plugin.label, icon, defaults: plugin.defaults, controls: [...(plugin.controls ?? [])] }; }
/** The editor grid is supplied by generated plug-ins plus explicitly registered experimental tools. */
export const PHOTO_EDITOR_TOOLS: ToolDefinition[] = [...browserManifests.values()].map(definitionFromPlugin);
export function getPhotoEditToolPlugin(toolId: string): PhotoEditToolBrowserManifest | undefined { return browserManifests.get(toolId); }
export function getPhotoEditToolUiPlugin(toolId: string): PhotoEditToolUiPlugin | undefined { return uiPlugins.get(toolId); }
export function createPhotoEditOperation(tool: ToolDefinition): PhotoEditOperation { return { id: crypto.randomUUID(), tool: tool.id, name: tool.label, enabled: true, maskId: null, values: { ...tool.defaults } }; }
