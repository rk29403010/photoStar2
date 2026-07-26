const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-folder-ingest-'));
}

async function removeDirWithRetry(targetPath) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return;
        } catch (error) {
            if (attempt === 9) {
                console.warn(`[Test Cleanup] Could not delete temp dir ${targetPath}: ${error.message}`);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
    }
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
    const nestedFolderPath = path.join(folderPath, 'nested');
    fs.mkdirSync(nestedFolderPath);
    fs.writeFileSync(path.join(nestedFolderPath, 'three.png'), pngBytes);
    return folderPath;
}

async function createFolderIngestHarness(tempDir) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { scanFolderPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/scan-folder/plugin.js');
    const { generatePreviewsPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-previews/plugin.js');
    const { extractEmbeddedMetadataPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/extract-embedded-metadata/plugin.js');
    const { detectFacesPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-faces/plugin.js');
    const { detectFramesPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-frames/plugin.js');
    const { generateFaceVectorsPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-face-vectors/plugin.js');
    const { resolvePeoplePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/resolve-people/plugin.js');
    const { groupSimilarPhotosPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/group-similar-photos/plugin.js');
    const { detectSensitiveContentPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-sensitive-content/plugin.js');
    const { createGenerateAiMetadataScoutPluginModule: createGenerateAiMetadataScoutModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-ai-metadata-scout/plugin.js');
    const { createGenerateAiMetadataRefinePluginModule: createGenerateAiMetadataRefineModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-ai-metadata-refine/plugin.js');
    const { estimatePhotoDatePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/estimate-photo-date/plugin.js');
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');

    const dbManager = new DatabaseManager(tempDir);
    const subjects = new runtime.SubjectRegistry();
    const modules = new runtime.ModuleRegistry();
    const workflows = new runtime.WorkflowRegistry({ subjects, modules });
    const store = new runtime.ExecutionStore(dbManager);

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

    modules.registerPlugin(scanFolderPlugin, { dbManager });
    modules.registerPlugin(extractEmbeddedMetadataPlugin, { dbManager });
    modules.registerPlugin(generatePreviewsPlugin, { dbManager });
    modules.registerPlugin(detectFacesPlugin, { dbManager });
    modules.registerPlugin(detectFramesPlugin, { dbManager });
    modules.registerPlugin(generateFaceVectorsPlugin, { dbManager });
    modules.registerPlugin(resolvePeoplePlugin, { dbManager });
    modules.registerPlugin(groupSimilarPhotosPlugin, { dbManager });
    modules.registerPlugin(detectSensitiveContentPlugin, { dbManager });
    modules.register(createGenerateAiMetadataScoutModule({ dbManager }));
    modules.register(createGenerateAiMetadataRefineModule({ dbManager }));
    modules.registerPlugin(estimatePhotoDatePlugin, { dbManager });
    workflows.register(folderIngestWorkflowDefinition);

    return {
        dbManager,
        folderIngestWorkflowDefinition,
        orchestrator: new runtime.WorkflowRuntimeOrchestrator({
            store,
            workflows,
            modules,
        }),
        store,
        runtime,
    };
}

function assertFolderIngestResults(dbManager, run, expectedAssetCount) {
    assert.equal(
        run.milestones.find((milestone) => milestone.milestoneId === 'library_ready')?.status,
        'completed'
    );
    assert.ok(run.summary.totalItems >= 3);

    const previewCount = dbManager.getDb().prepare(
        "SELECT COUNT(DISTINCT asset_id) AS count FROM previews WHERE size = 'thumbnail'"
    ).get();
    assert.equal(previewCount.count, expectedAssetCount);

    const assetRows = dbManager.getDb().prepare(
        'SELECT file_hash, width, height, metadata_timestamp_source FROM assets ORDER BY created_at ASC'
    ).all();
    assert.equal(assetRows.length, expectedAssetCount);
    assert.ok(assetRows.every((row) => typeof row.file_hash === 'string' && row.file_hash.length > 0));
    assert.deepEqual(assetRows.map((row) => [row.width, row.height]), Array.from({ length: expectedAssetCount }, () => [1, 1]));
    assert.deepEqual(assetRows.map((row) => row.metadata_timestamp_source), Array(expectedAssetCount).fill(null));
}

test('folder_ingest_v1 scans a folder, creates asset work, and reaches Library ready after previews', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    let harness;

    try {
        harness = await createFolderIngestHarness(tempDir);

        const runId = await harness.orchestrator.start({
            workflowId: 'folder_ingest_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'folder', subjectId: folderPath }],
            parameters: {
                folderPath,
                traversalMode: 'folder_only',
                aiMode: 'off',
            },
        });

        const run = harness.store.getRunDetail(runId);
        assertFolderIngestResults(harness.dbManager, run, 2);
    } finally {
        harness?.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});

test('folder_ingest_v1 includes nested images when traversalMode is recursive', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    let harness;

    try {
        harness = await createFolderIngestHarness(tempDir);

        const runId = await harness.orchestrator.start({
            workflowId: 'folder_ingest_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'folder', subjectId: folderPath }],
            parameters: {
                folderPath,
                traversalMode: 'recursive',
                aiMode: 'off',
            },
        });

        assertFolderIngestResults(harness.dbManager, harness.store.getRunDetail(runId), 3);
    } finally {
        harness?.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});

test('folder_ingest_v1 emits preview-generated events for workflow-runtime previews', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    const emittedEvents = [];
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { scanFolderPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/scan-folder/plugin.js');
    const { generatePreviewsPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-previews/plugin.js');
    const { extractEmbeddedMetadataPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/extract-embedded-metadata/plugin.js');
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const subjects = new runtime.SubjectRegistry();
        const modules = new runtime.ModuleRegistry();
        const workflows = new runtime.WorkflowRegistry({ subjects, modules });
        const store = new runtime.ExecutionStore(dbManager);

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

        modules.registerPlugin(scanFolderPlugin, { dbManager });
        modules.registerPlugin(extractEmbeddedMetadataPlugin, { dbManager });
        modules.registerPlugin(generatePreviewsPlugin, {
            dbManager,
            eventBus: {
                emit(event) {
                    emittedEvents.push(event);
                },
            },
        });
        workflows.register({
            ...folderIngestWorkflowDefinition,
            nodes: [
                folderIngestWorkflowDefinition.nodes.find((node) => node.id === 'scan-folder'),
                {
                    ...folderIngestWorkflowDefinition.nodes.find((node) => node.id === 'preview-each'),
                    outputsTo: ['generate-previews'],
                },
                {
                    ...folderIngestWorkflowDefinition.nodes.find((node) => node.id === 'generate-previews'),
                    outputsTo: [],
                },
            ],
        });

        const orchestrator = new runtime.WorkflowRuntimeOrchestrator({
            store,
            workflows,
            modules,
        });

        await orchestrator.start({
            workflowId: 'folder_ingest_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'folder', subjectId: folderPath }],
            parameters: {
                folderPath,
                traversalMode: 'folder_only',
                aiMode: 'off',
            },
        });

        const previewEvents = emittedEvents.filter((event) => event.type === 'WorkflowPreviewGenerated');
        assert.equal(previewEvents.length, 2);
        assert.ok(previewEvents.every((event) => event.path.endsWith('-thumbnail.webp')));
    } finally {
        dbManager?.close();
        await removeDirWithRetry(tempDir);
    }
});
