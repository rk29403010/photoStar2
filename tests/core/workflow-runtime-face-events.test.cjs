const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-face-events-'));
}

function createFixtureFolder(rootDir) {
    const folderPath = path.join(rootDir, 'fixtures');
    fs.mkdirSync(folderPath, { recursive: true });
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6lrn8AAAAASUVORK5CYII=',
        'base64'
    );
    fs.writeFileSync(path.join(folderPath, 'one.png'), pngBytes);
    fs.writeFileSync(path.join(folderPath, 'two.png'), pngBytes);
    return folderPath;
}

function registerTestSubjects(subjects) {
    subjects.register({
        id: 'folder',
        version: 1,
        durable: false,
        summary: { titleField: 'path', thumbnailStrategy: 'none' },
        progressSemantics: 'aggregate',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'folder', plural: 'folders' },
    });
    subjects.register({
        id: 'asset',
        version: 1,
        durable: true,
        summary: { titleField: 'id', thumbnailStrategy: 'asset' },
        progressSemantics: 'per_subject',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'file', plural: 'files' },
    });
}

function registerFaceEventWorkflow({ workflows, definition }) {
    workflows.register({
        ...definition,
        nodes: definition.nodes.filter((node) => (
            ['scan-folder', 'preview-each', 'extract-embedded-metadata', 'generate-previews', 'detect-faces'].includes(node.id)
        )).map((node) => {
            if (node.id === 'preview-each') {
                return { ...node, outputsTo: ['extract-embedded-metadata', 'generate-previews'] };
            }
            if (node.id === 'extract-embedded-metadata') {
                return { ...node, outputsTo: [] };
            }
            if (node.id === 'generate-previews') {
                return { ...node, outputsTo: ['detect-faces'] };
            }
            if (node.id === 'detect-faces') {
                return { ...node, outputsTo: [] };
            }
            return node;
        }),
    });
}

async function createRuntimeHarness(tempDir, emittedEvents) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { scanFolderPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/scan-folder/plugin.js');
    const { generatePreviewsPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-previews/plugin.js');
    const { extractEmbeddedMetadataPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/extract-embedded-metadata/plugin.js');
    const { detectFacesPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-faces/plugin.js');
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');

    const dbManager = new DatabaseManager(tempDir);
    const subjects = new runtime.SubjectRegistry();
    const modules = new runtime.ModuleRegistry();
    const workflows = new runtime.WorkflowRegistry({ subjects, modules });
    const store = new runtime.ExecutionStore(dbManager);

    registerTestSubjects(subjects);
    modules.registerPlugin(scanFolderPlugin, { dbManager });
    modules.registerPlugin(generatePreviewsPlugin, { dbManager });
    modules.registerPlugin(extractEmbeddedMetadataPlugin, { dbManager });
    modules.registerPlugin(detectFacesPlugin, {
        dbManager,
        eventBus: {
            emit(event) {
                emittedEvents.push(event);
            },
        },
    });
    registerFaceEventWorkflow({ workflows, definition: folderIngestWorkflowDefinition });

    return {
        dbManager,
        orchestrator: new runtime.WorkflowRuntimeOrchestrator({
            store,
            workflows,
            modules,
        }),
    };
}

test('folder ingest emits FacesDetected events for workflow-runtime detections', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    const emittedEvents = [];
    let dbManager;

    try {
        const harness = await createRuntimeHarness(tempDir, emittedEvents);
        dbManager = harness.dbManager;

        await harness.orchestrator.start({
            workflowId: 'folder_ingest_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'folder', subjectId: folderPath }],
            parameters: {
                folderPath,
                traversalMode: 'folder_only',
                aiMode: 'off',
            },
        });

        const faceEvents = emittedEvents.filter((event) => event.type === 'FacesDetected');
        assert.equal(faceEvents.length, 2);
        assert.ok(faceEvents.every((event) => event.source === 'workflow_runtime'));

        const detectionRow = dbManager.getDb().prepare(
            "SELECT provider, model_version, data FROM derived_results WHERE task = 'face_detection' ORDER BY created_at ASC LIMIT 1"
        ).get();
        assert.equal(detectionRow.provider, 'onnx_retina_10g');
        assert.equal(detectionRow.model_version, '1.0');
        const persistedFaces = JSON.parse(detectionRow.data).faces;
        assert.equal(Array.isArray(persistedFaces), true);
        if (persistedFaces.length > 0) {
            assert.deepEqual(Object.keys(persistedFaces[0].box).sort(), ['height', 'width', 'x', 'y']);
        }
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
