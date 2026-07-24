import type { PhotoEditToolPlugin } from './photoEditToolPlugin.ts';
import { validatePhotoEditToolPlugin } from './photoEditToolPlugin.ts';

export class PhotoEditToolRegistry {
    private readonly tools = new Map<string, PhotoEditToolPlugin>();
    registerPlugin(plugin: PhotoEditToolPlugin): void { validatePhotoEditToolPlugin(plugin); if (this.tools.has(plugin.id)) { throw new Error(`duplicate photo edit tool '${plugin.id}'`); } this.tools.set(plugin.id, plugin); }
    registerLegacy(plugin: PhotoEditToolPlugin): boolean { validatePhotoEditToolPlugin(plugin); if (this.tools.has(plugin.id)) { return false; } this.tools.set(plugin.id, plugin); return true; }
    get(id: string): PhotoEditToolPlugin | undefined { return this.tools.get(id); }
    list(): readonly PhotoEditToolPlugin[] { return [...this.tools.values()]; }
}
