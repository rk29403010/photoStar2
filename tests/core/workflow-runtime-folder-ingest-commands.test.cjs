const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-folder-ingest-commands-'));
}

function createResponseCollector() {
    const responses = [];
    return {
        respond: (id, status, data, error) => {
            responses.push({ id, status, data, error });
        },
        async takeLast() {
            for (let attempt = 0; attempt < 20; attempt += 1) {
                const response = responses.at(-1);
                if (response) {
                    return response;
                }
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            const response = responses.at(-1);
            if (!response) {
                throw new Error('expected a command response');
            }
            return response;
        },
    };
}

function createFixtureFolder(rootDir) {
    const folderPath = path.join(rootDir, 'fixtures');
    fs.mkdirSync(folderPath, { recursive: true });
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6lrn8AAAAASUVORK5CYII=',
        'base64'
    );
    fs.writeFileSync(path.join(folderPath, 'one.png'), pngBytes);
    return folderPath;
}

async function createCommandHarness(tempDir) {
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { createScanFolderModule } = await import('../../dist/core/src/services/workflowRuntime/modules/scanFolderModule.js');
    const { createGeneratePreviewsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generatePreviewsModule.js');
    const { createDetectFacesModule } = await import('../../dist/core/src/services/workflowRuntime/modules/detectFacesModule.js');
    const { createGenerateFaceVectorsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateFaceVectorsModule.js');
    const { createResolvePeopleModule } = await import('../../dist/core/src/services/workflowRuntime/modules/resolvePeopleModule.js');
    const { createGroupSimilarPhotosModule } = await import('../../dist/core/src/services/workflowRuntime/modules/groupSimilarPhotosModule.js');
    const { createDetectSensitiveContentModule } = await import('../../dist/core/src/services/workflowRuntime/modules/detectSensitiveContentModule.js');
    const { createGenerateAiMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadataModule.js');
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');

    const dbManager = new DatabaseManager(tempDir);
    const subjects = new runtime.SubjectRegistry();
    const modules = new runtime.ModuleRegistry();
    const workflows = new runtime.WorkflowRegistry({ subjects, modules });
    const store = new runtime.ExecutionStore(dbManager);
    const orchestrator = new runtime.WorkflowRuntimeOrchestrator({
        store,
        workflows,
        modules,
    });
    const collector = createResponseCollector();

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
    modules.register(createGeneratePreviewsModule({ dbManager }));
    modules.register(createDetectFacesModule({ dbManager }));
    modules.register(createGenerateFaceVectorsModule({ dbManager }));
    modules.register(createResolvePeopleModule({ dbManager }));
    modules.register(createGroupSimilarPhotosModule({ dbManager }));
    modules.register(createDetectSensitiveContentModule({ dbManager }));
    modules.register(createGenerateAiMetadataModule({ dbManager }));
    workflows.register(folderIngestWorkflowDefinition);

    return { dbManager, collector, store, orchestrator };
}

test('start_folder_ingest starts folder_ingest_v1 with parameters and milestone-aware detail', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let harness;

    try {
        harness = await createCommandHarness(tempDir);

        handleSystemCommand({
            id: 'cmd-1',
            command: 'start_folder_ingest',
            payload: { folderPath, traversalMode: 'recursive', aiMode: 'mock' },
            dbManager: harness.dbManager,
            eventBus: {},
            coordinator: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: harness.collector.respond,
            workflowRuntime: { store: harness.store, orchestrator: harness.orchestrator },
        });

        const startResponse = await harness.collector.takeLast();
        assert.equal(startResponse.status, 'ok');
        assert.ok(startResponse.data.runId);

        handleSystemCommand({
            id: 'cmd-2',
            command: 'get_workflow_run_detail',
            payload: { runId: startResponse.data.runId },
            dbManager: harness.dbManager,
            eventBus: {},
            coordinator: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: harness.collector.respond,
            workflowRuntime: { store: harness.store, orchestrator: harness.orchestrator },
        });

        const detailResponse = await harness.collector.takeLast();
        assert.equal(detailResponse.status, 'ok');
        assert.equal(detailResponse.data.parameters.aiMode, 'mock');
        assert.ok(detailResponse.data.milestones.some((milestone) => milestone.milestoneId === 'library_ready'));
    } finally {
        harness?.dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('get_system_jobs includes step-level workflow run counts for ingest-centric dashboard summaries', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let harness;

    try {
        harness = await createCommandHarness(tempDir);

        handleSystemCommand({
            id: 'cmd-1',
            command: 'start_folder_ingest',
            payload: { folderPath, traversalMode: 'recursive', aiMode: 'mock' },
            dbManager: harness.dbManager,
            eventBus: {},
            coordinator: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: harness.collector.respond,
            workflowRuntime: { store: harness.store, orchestrator: harness.orchestrator },
        });
        await harness.collector.takeLast();

        handleSystemCommand({
            id: 'cmd-2',
            command: 'get_system_jobs',
            payload: {},
            dbManager: harness.dbManager,
            eventBus: {},
            coordinator: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: harness.collector.respond,
            workflowRuntime: { store: harness.store, orchestrator: harness.orchestrator },
        });

        const snapshotResponse = await harness.collector.takeLast();
        assert.equal(snapshotResponse.status, 'ok');
        assert.ok(Array.isArray(snapshotResponse.data.workflowRuns));
        const folderRun = snapshotResponse.data.workflowRuns.find((run) => run.workflowId === 'folder_ingest_v1');
        assert.ok(folderRun);
        const previewStep = folderRun.stepSummaries.find((step) => step.nodeId === 'generate-previews');
        assert.ok(previewStep);
        assert.equal(previewStep.completedItems, 1);
        assert.equal(previewStep.totalItems, 1);
    } finally {
        harness?.dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
