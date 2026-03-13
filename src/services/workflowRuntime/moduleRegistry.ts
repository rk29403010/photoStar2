import type { ModuleDefinition } from './contracts';
import { validateModuleDefinition } from './contracts';

export class ModuleRegistry {
    private readonly modules = new Map<string, ModuleDefinition>();

    public register(definition: ModuleDefinition): void {
        validateModuleDefinition(definition);
        if (this.modules.has(definition.id)) {
            throw new Error(`duplicate module '${definition.id}'`);
        }
        this.modules.set(definition.id, definition);
    }

    public has(moduleId: string): boolean {
        return this.modules.has(moduleId);
    }

    public get(moduleId: string): ModuleDefinition {
        const definition = this.modules.get(moduleId);
        if (!definition) {
            throw new Error(`unknown module '${moduleId}'`);
        }
        return definition;
    }
}
