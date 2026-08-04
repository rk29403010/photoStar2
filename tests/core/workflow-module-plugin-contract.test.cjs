const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXPECTED_WORKFLOW_MODULE_IDS = [
    'legacy.preview.generate',
    'runtime.detect_faces',
    'runtime.detect_frame',
    'runtime.detect_sensitive_content',
    'runtime.estimate_photo_date',
    'runtime.expand_selection',
    'runtime.extract_embedded_metadata',
    'runtime.generate_ai_metadata_refine',
    'runtime.generate_ai_metadata_scout',
    'runtime.generate_face_vectors',
    'runtime.generate_previews',
    'runtime.group_similar_photos',
    'runtime.resolve_people',
    'runtime.scan_folder',
    'runtime.segment_objects',
    'runtime.simulator',
];

test('workflow module plugins expose a valid reusable contract', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { generatedWorkflowModulePlugins } = await import('../../dist/core/src/services/workflowRuntime/generatedModulePluginRegistry.js');
    const ids = new Set();
    for (const plugin of generatedWorkflowModulePlugins) {
        runtime.validateWorkflowModulePlugin(plugin);
        assert.equal(ids.has(plugin.manifest.id), false, `duplicate plug-in id ${plugin.manifest.id}`);
        ids.add(plugin.manifest.id);
    }
    assert.deepEqual([...ids].sort(), EXPECTED_WORKFLOW_MODULE_IDS);
});

test('runtime bootstrap creates every generated plug-in without legacy registration', async () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-workflow-plugin-'));
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { EventBus } = await import('../../dist/core/src/services/events/bus.js');
    const { createWorkflowRuntimeBundle } = await import('../../dist/core/src/entrypoints/core/runtimeBootstrap.js');
    const dbManager = new DatabaseManager(temporaryDirectory);

    try {
        const bundle = createWorkflowRuntimeBundle(dbManager, new EventBus(dbManager));
        for (const moduleId of EXPECTED_WORKFLOW_MODULE_IDS) {
            assert.equal(bundle.modules.has(moduleId), true, `missing module '${moduleId}'`);
        }
        const bootstrapSource = fs.readFileSync(path.join(process.cwd(), 'src/entrypoints/core/runtimeBootstrap.ts'), 'utf8');
        assert.equal(bootstrapSource.includes('.registerLegacy('), false);
    } finally {
        dbManager.close();
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
});

test('module registry diagnoses invalid and duplicate plug-ins', async () => {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const registry = new runtime.ModuleRegistry();
    assert.throws(() => registry.registerPlugin({ manifest: {}, create: () => ({}) }), /manifest.id/);
    const plugin = {
        manifest: { id: 'runtime.plugin', contractVersion: 1, displayName: 'Plugin', description: 'Test plugin', inputs: ['asset'], outputs: [], capabilities: ['derive'] },
        create: () => ({ id: 'runtime.plugin', version: 1, capability: 'derive', accepts: ['asset'], produces: [], run: async () => ({ outputs: [] }) }),
    };
    registry.registerPlugin(plugin);
    assert.throws(() => registry.registerPlugin(plugin), /duplicate module/);
});
