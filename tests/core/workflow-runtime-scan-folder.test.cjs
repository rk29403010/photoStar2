const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-folder-ingest-'));
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

async function createFolderIngestHarness(tempDir) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { createScanFolderModule } = await import('../../dist/core/src/services/workflowRuntime/modules/scanFolderModule.js');
    const { createGeneratePreviewsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generatePreviewsModule.js');
    const { createExtractEmbeddedMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/extractEmbeddedMetadataModule.js');
    const { createDetectFacesModule } = await import('../../dist/core/src/services/workflowRuntime/modules/detectFacesModule.js');
    const { createGenerateFaceVectorsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateFaceVectorsModule.js');
    const { createResolvePeopleModule } = await import('../../dist/core/src/services/workflowRuntime/modules/resolvePeopleModule.js');
    const { createGroupSimilarPhotosModule } = await import('../../dist/core/src/services/workflowRuntime/modules/groupSimilarPhotosModule.js');
    const { createDetectSensitiveContentModule } = await import('../../dist/core/src/services/workflowRuntime/modules/detectSensitiveContentModule.js');
    const { createGenerateAiMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadataModule.js');
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

    modules.register(createScanFolderModule({ dbManager }));
    modules.register(createExtractEmbeddedMetadataModule({ dbManager }));
    modules.register(createGeneratePreviewsModule({ dbManager }));
    modules.register(createDetectFacesModule({ dbManager }));
    modules.register(createGenerateFaceVectorsModule({ dbManager }));
    modules.register(createResolvePeopleModule({ dbManager }));
    modules.register(createGroupSimilarPhotosModule({ dbManager }));
    modules.register(createDetectSensitiveContentModule({ dbManager }));
    modules.register(createGenerateAiMetadataModule({ dbManager }));
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

function assertFolderIngestResults(dbManager, run) {
    assert.equal(
        run.milestones.find((milestone) => milestone.milestoneId === 'library_ready')?.status,
        'completed'
    );
    assert.ok(run.summary.totalItems >= 3);

    const previewCount = dbManager.getDb().prepare(
        "SELECT COUNT(DISTINCT asset_id) AS count FROM previews WHERE size = 'thumbnail'"
    ).get();
    assert.equal(previewCount.count, 2);

    const assetRows = dbManager.getDb().prepare(
        'SELECT file_hash, width, height, metadata_timestamp_source FROM assets ORDER BY created_at ASC'
    ).all();
    assert.equal(assetRows.length, 2);
    assert.ok(assetRows.every((row) => typeof row.file_hash === 'string' && row.file_hash.length > 0));
    assert.deepEqual(assetRows.map((row) => [row.width, row.height]), [[1, 1], [1, 1]]);
    assert.deepEqual(assetRows.map((row) => row.metadata_timestamp_source), ['file.birthtime', 'file.birthtime']);
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
        assertFolderIngestResults(harness.dbManager, run);
    } finally {
        harness?.dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('folder_ingest_v1 emits preview-generated events for workflow-runtime previews', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    const emittedEvents = [];
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { createScanFolderModule } = await import('../../dist/core/src/services/workflowRuntime/modules/scanFolderModule.js');
    const { createGeneratePreviewsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generatePreviewsModule.js');
    const { createExtractEmbeddedMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/extractEmbeddedMetadataModule.js');
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

        modules.register(createScanFolderModule({ dbManager }));
        modules.register(createExtractEmbeddedMetadataModule({ dbManager }));
        modules.register(createGeneratePreviewsModule({
            dbManager,
            eventBus: {
                emit(event) {
                    emittedEvents.push(event);
                },
            },
        }));
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
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
