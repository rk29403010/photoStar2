import { Aperture, Blend, CloudSun, Contrast, Crop, Focus, ImageUp, Palette, RotateCw, ScanEye, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PhotoEditOperation, PhotoEditTool } from '@contracts/core';
import { generatedPhotoEditToolPlugins } from '../../../services/photoEditing/generatedPhotoEditToolPluginRegistry.ts';
import { PhotoEditToolRegistry } from '../../../services/photoEditing/photoEditToolRegistry.ts';
import type { PhotoEditToolPlugin } from '../../../services/photoEditing/photoEditToolPlugin.ts';
import { generatedPhotoEditToolUiPlugins } from './generatedPhotoEditToolUiRegistry.ts';
import type { PhotoEditToolUiPlugin } from './photoEditToolUiRegistry.ts';

export type ToolDefinition = { id: PhotoEditTool; label: string; icon: LucideIcon; defaults: Record<string, number | boolean>; controls: Array<{ key: string; label: string; min: number; max: number; step: number; }>; };
const ICONS: Record<string, LucideIcon> = { Aperture, Blend, CloudSun, Contrast, Crop, Focus, ImageUp, Palette, ScanEye, RotateCw, SlidersHorizontal, Sparkles };
const registry = new PhotoEditToolRegistry();
for (const plugin of generatedPhotoEditToolPlugins) { registry.registerPlugin(plugin); }
const uiPlugins = new Map<string, PhotoEditToolUiPlugin>();
for (const plugin of generatedPhotoEditToolUiPlugins) {
    if (!registry.get(plugin.id) || uiPlugins.has(plugin.id)) { throw new Error(`invalid photo edit tool UI plug-in '${plugin.id}'`); }
    uiPlugins.set(plugin.id, plugin);
}
function definitionFromPlugin(plugin: PhotoEditToolPlugin): ToolDefinition { const icon = ICONS[plugin.icon]; if (!icon) { throw new Error(`photo edit tool '${plugin.id}' references unknown icon '${plugin.icon}'`); } return { id: plugin.id, label: plugin.label, icon, defaults: plugin.defaults, controls: [...(plugin.controls ?? [])] }; }
/** The editor grid is wholly supplied by the generated plug-in registry. */
export const PHOTO_EDITOR_TOOLS: ToolDefinition[] = registry.list().map(definitionFromPlugin);
export function getPhotoEditToolPlugin(toolId: string): PhotoEditToolPlugin | undefined { return registry.get(toolId); }
export function getPhotoEditToolUiPlugin(toolId: string): PhotoEditToolUiPlugin | undefined { return uiPlugins.get(toolId); }
export function createPhotoEditOperation(tool: ToolDefinition): PhotoEditOperation { return { id: crypto.randomUUID(), tool: tool.id, name: tool.label, enabled: true, maskId: null, values: { ...tool.defaults } }; }
