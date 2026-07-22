import type { ModuleDefinition, WorkflowModulePlugin, WorkflowModulePluginContext } from './contracts';
import { validateModuleDefinition, validateWorkflowModulePlugin } from './contracts';

export class ModuleRegistry {
    private readonly modules = new Map<string, ModuleDefinition>();

    public register(definition: ModuleDefinition): void {
        validateModuleDefinition(definition);
        if (this.modules.has(definition.id)) {
            throw new Error(`duplicate module '${definition.id}'`);
        }
        this.modules.set(definition.id, definition);
    }

    public registerPlugin(plugin: WorkflowModulePlugin, context: WorkflowModulePluginContext = {}): void {
        validateWorkflowModulePlugin(plugin);
        const definition = plugin.create(context);
        validateModuleDefinition(definition);
        if (definition.id !== plugin.manifest.id) {
            throw new Error(`workflow module plugin '${plugin.manifest.id}' created '${definition.id}'`);
        }
        const validateConfiguration = plugin.validateConfiguration;
        this.register({
            ...definition,
            run: async (runtimeContext) => {
                validateConfiguration?.(runtimeContext.parameters);
                return definition.run(runtimeContext);
            },
            estimate: definition.estimate === undefined ? undefined : async (runtimeContext) => {
                validateConfiguration?.(runtimeContext.parameters);
                return definition.estimate?.(runtimeContext) ?? { outputs: [] };
            },
        });
    }

    /** Registers an unmigrated factory result without overriding a plug-in. */
    public registerLegacy(definition: ModuleDefinition): boolean {
        validateModuleDefinition(definition);
        if (this.modules.has(definition.id)) {
            return false;
        }
        this.modules.set(definition.id, definition);
        return true;
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
