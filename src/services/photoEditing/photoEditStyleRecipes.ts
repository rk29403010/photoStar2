import type { PhotoEditOperation, PhotoEditStyle } from '../../boundary/contracts/photoEditor.ts';
import { generatedPhotoEditToolPlugins } from './generatedPhotoEditToolPluginRegistry.ts';
import { PhotoEditToolRegistry } from './photoEditToolRegistry.ts';

export type ResolvedPhotoEditStyle = PhotoEditStyle & { unavailableOperationIds: string[] };

const registry = new PhotoEditToolRegistry();
for (const plugin of generatedPhotoEditToolPlugins) { registry.registerPlugin(plugin); }

function resolveOperation(toolRegistry: PhotoEditToolRegistry, operation: PhotoEditOperation): { operation: PhotoEditOperation; unavailable: boolean } {
    const plugin = toolRegistry.get(operation.tool);
    if (!plugin) { return { operation: { ...operation, values: { ...operation.values } }, unavailable: true }; }
    const storedVersion = operation.recipeVersion ?? 1;
    if (storedVersion > plugin.recipeVersion) { return { operation: { ...operation, values: { ...operation.values } }, unavailable: true }; }
    let resolved = { ...operation, values: { ...operation.values }, recipeVersion: storedVersion };
    try {
        if (storedVersion < plugin.recipeVersion && plugin.migrateOperation) {
            resolved = { ...plugin.migrateOperation(resolved, storedVersion), recipeVersion: plugin.recipeVersion };
        }
        plugin.validateOperation?.(resolved);
        return { operation: resolved, unavailable: false };
    } catch {
        return { operation: { ...operation, values: { ...operation.values } }, unavailable: true };
    }
}

/** Resolves installed tools generically while retaining unavailable recipe entries verbatim. */
export function resolvePhotoEditStyle(style: PhotoEditStyle): ResolvedPhotoEditStyle {
    return resolvePhotoEditStyleWithRegistry(style, registry);
}

export function resolvePhotoEditStyleWithRegistry(style: PhotoEditStyle, toolRegistry: PhotoEditToolRegistry): ResolvedPhotoEditStyle {
    const unavailableOperationIds: string[] = [];
    const operations = style.operations.map((operation) => {
        const resolved = resolveOperation(toolRegistry, operation);
        if (resolved.unavailable) { unavailableOperationIds.push(operation.id); }
        return resolved.operation;
    });
    return { ...style, operations, masks: style.masks.map((mask) => ({ ...mask })), unavailableOperationIds };
}

/** Writes the current recipe version for installed tools without changing unavailable data. */
export function versionPhotoEditStyleOperations(operations: readonly PhotoEditOperation[]): PhotoEditOperation[] {
    return operations.map((operation) => {
        const plugin = registry.get(operation.tool);
        return { ...operation, values: { ...operation.values }, ...(plugin ? { recipeVersion: plugin.recipeVersion } : {}) };
    });
}
