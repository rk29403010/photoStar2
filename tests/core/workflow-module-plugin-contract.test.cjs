const test = require('node:test');
const assert = require('node:assert/strict');

test('workflow module plugins expose a valid reusable contract', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { generatedWorkflowModulePlugins } = await import('../../dist/core/src/services/workflowRuntime/generatedModulePluginRegistry.js');
    const ids = new Set();
    for (const plugin of generatedWorkflowModulePlugins) {
        runtime.validateWorkflowModulePlugin(plugin);
        assert.equal(ids.has(plugin.manifest.id), false, `duplicate plug-in id ${plugin.manifest.id}`);
        ids.add(plugin.manifest.id);
    }
});

test('module registry diagnoses invalid plug-ins and gives plug-ins precedence over legacy registration', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const registry = new runtime.ModuleRegistry();
    assert.throws(() => registry.registerPlugin({ manifest: {}, create: () => ({}) }), /manifest.id/);
    const plugin = {
        manifest: { id: 'runtime.plugin', contractVersion: 1, displayName: 'Plugin', description: 'Test plugin', inputs: ['asset'], outputs: [], capabilities: ['derive'] },
        create: () => ({ id: 'runtime.plugin', version: 1, capability: 'derive', accepts: ['asset'], produces: [], run: async () => ({ outputs: [] }) }),
    };
    registry.registerPlugin(plugin);
    assert.equal(registry.registerLegacy({ id: 'runtime.plugin', version: 1, capability: 'derive', accepts: ['asset'], produces: [], run: async () => ({ outputs: [] }) }), false);
});
