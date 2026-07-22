import type { ModuleRegistry } from './moduleRegistry';
import type { WorkflowModulePlugin, WorkflowModulePluginContext } from './contracts';

export function registerWorkflowModulePlugins(
    registry: ModuleRegistry,
    plugins: readonly WorkflowModulePlugin[],
    context: WorkflowModulePluginContext,
): void {
    for (const plugin of plugins) {
        registry.registerPlugin(plugin, context);
    }
}
