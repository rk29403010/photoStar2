const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-workflow-recovery-'));
}

function createResponseCollector() {
    const responses = [];
    return {
        respond: (id, status, data, error) => {
            responses.push({ id, status, data, error });
        },
        async takeById(expectedId) {
            for (let attempt = 0; attempt < 20; attempt += 1) {
                const response = responses.findLast((candidate) => candidate.id === expectedId);
                if (response) {
                    return response;
                }
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            throw new Error(`expected a command response for ${expectedId}`);
        },
        async takeLast() {
            for (let attempt = 0; attempt < 20; attempt += 1) {
                const response = responses.at(-1);
                if (response) {
                    return response;
                }
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            throw new Error('expected a command response');
        },
    };
}

function createFixtureFolder(rootDir) {
    const folderPath = path.join(rootDir, 'fixtures');
    fs.mkdirSync(folderPath, { recursive: true });
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6lrn8AAAAASUVORK5CYII=',
        'base64',
    );
    fs.writeFileSync(path.join(folderPath, 'one.png'), pngBytes);
    return folderPath;
}

async function createCommandHarness(tempDir, options = {}) {
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
    const { createEstimatePhotoDateModule } = await import('../../dist/core/src/services/workflowRuntime/modules/estimatePhotoDateModule.js');
    const { createExpandSelectionModule } = await import('../../dist/core/src/services/workflowRuntime/modules/expandSelectionModule.js');
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');
    const { selectedSubjectMetadataWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/selectedSubjectMetadataWorkflow.js');
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
    subjects.register({
        id: 'selection',
        version: 1,
        durable: false,
        summary: { titleField: 'id', thumbnailStrategy: 'none' },
        progressSemantics: 'aggregate',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'selection', plural: 'selections' },
    });

    modules.register(createScanFolderModule({ dbManager }));
    modules.register(createExtractEmbeddedMetadataModule({ dbManager }));
    modules.register(createGeneratePreviewsModule({ dbManager }));
    modules.register(createDetectFacesModule({ dbManager }));
    modules.register(createGenerateFaceVectorsModule({ dbManager }));
    modules.register(createResolvePeopleModule({ dbManager }));
    modules.register(createGroupSimilarPhotosModule({ dbManager }));
    modules.register(createDetectSensitiveContentModule({ dbManager }));
    modules.register(createGenerateAiMetadataModule({ dbManager, aiRuntime: options.aiRuntime }));
    modules.register(createEstimatePhotoDateModule({ dbManager }));
    modules.register(createExpandSelectionModule());
    workflows.register(folderIngestWorkflowDefinition);
    workflows.register(selectedSubjectMetadataWorkflowDefinition);

    return { dbManager, collector, store, orchestrator, workflows };
}

async function waitForWorkflowRunStatus(harness, runId, expectedStatuses) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const detail = harness.store.getRunDetail(runId);
        if (expectedStatuses.includes(detail.summary.status)) {
            return detail;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error(`workflow run '${runId}' did not reach one of: ${expectedStatuses.join(', ')}`);
}

test('failed folder ingest exposes the failed asset path in run detail and workflow visualiser detail', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let harness;

    try {
        harness = await createCommandHarness(tempDir, {
            aiRuntime: {
                async generateLiveMetadata() {
                    throw new Error('[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: fetch failed');
                },
            },
        });

        handleSystemCommand({
            id: 'cmd-1',
            command: 'start_folder_ingest',
            payload: { folderPath, traversalMode: 'recursive', aiMode: 'live' },
            dbManager: harness.dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: harness.collector.respond,
            workflowRuntime: { store: harness.store, orchestrator: harness.orchestrator, workflows: harness.workflows },
        });

        const startResponse = await harness.collector.takeLast();
        await waitForWorkflowRunStatus(harness, startResponse.data.runId, ['failed']);

        handleSystemCommand({
            id: 'cmd-2',
            command: 'get_workflow_run_detail',
            payload: { runId: startResponse.data.runId },
            dbManager: harness.dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: harness.collector.respond,
            workflowRuntime: { store: harness.store, orchestrator: harness.orchestrator, workflows: harness.workflows },
        });

        const detailResponse = await harness.collector.takeById('cmd-2');
        const metadataStep = detailResponse.data.steps.find((step) => step.nodeId === 'generate-ai-metadata');
        assert.ok(metadataStep);
        assert.equal(metadataStep.failedSubjects.length, 1);
        assert.match(metadataStep.failedSubjects[0].originalPath, /one\.png$/);

        handleSystemCommand({
            id: 'cmd-3',
            command: 'get_workflow_visualiser',
            payload: { workflowId: 'folder_ingest_v1', runId: startResponse.data.runId },
            dbManager: harness.dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: harness.collector.respond,
            workflowRuntime: { store: harness.store, orchestrator: harness.orchestrator, workflows: harness.workflows },
        });

        const visualiserResponse = await harness.collector.takeById('cmd-3');
        const visualiserDetail = visualiserResponse.data.details.find((detail) => detail.id === 'generate-ai-metadata');
        assert.ok(visualiserDetail);
        assert.equal(visualiserDetail.failedSubjects.length, 1);
        assert.match(visualiserDetail.failedSubjects[0].originalPath, /one\.png$/);
    } finally {
        harness?.dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('rerun_missing_folder_ai_metadata starts a new selected-subject workflow for assets missing metadata in the folder', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let harness;

    try {
        harness = await createCommandHarness(tempDir);

        handleSystemCommand({
            id: 'cmd-1',
            command: 'start_folder_ingest',
            payload: { folderPath, traversalMode: 'recursive', aiMode: 'off' },
            dbManager: harness.dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: harness.collector.respond,
            workflowRuntime: { store: harness.store, orchestrator: harness.orchestrator, workflows: harness.workflows },
        });

        const ingestResponse = await harness.collector.takeLast();
        await waitForWorkflowRunStatus(harness, ingestResponse.data.runId, ['completed']);
        const sourceRunId = harness.store.createWorkflowRun({
            workflowId: 'folder_ingest_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'folder', subjectId: folderPath }],
            parameters: { folderPath, traversalMode: 'recursive', aiMode: 'live' },
        });

        handleSystemCommand({
            id: 'cmd-2',
            command: 'rerun_missing_folder_ai_metadata',
            payload: { runId: sourceRunId },
            dbManager: harness.dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: harness.collector.respond,
            workflowRuntime: { store: harness.store, orchestrator: harness.orchestrator, workflows: harness.workflows },
        });

        const rerunResponse = await harness.collector.takeById('cmd-2');
        assert.equal(rerunResponse.status, 'ok');
        assert.equal(rerunResponse.data.assetCount, 1);
        assert.ok(rerunResponse.data.runId);
        const rerunDetail = harness.store.getRunDetail(rerunResponse.data.runId);
        assert.equal(rerunDetail.summary.workflowId, 'selected_subject_metadata_v1');
        assert.equal(rerunDetail.parameters.aiMode, 'live');
        assert.equal(rerunDetail.parameters.imageStrategy, 'overview_only');
        assert.equal(rerunDetail.parameters.selectedSubjects.length, 1);
        assert.equal(rerunDetail.parameters.selectedSubjects[0].subjectType, 'asset');
        await waitForWorkflowRunStatus(harness, rerunResponse.data.runId, ['completed', 'failed']);
    } finally {
        harness?.dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('start_selected_subject_metadata_workflow preserves requested analysis mode parameters', async () => {
    const tempDir = createTempDir();
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let harness;

    try {
        harness = await createCommandHarness(tempDir);
        harness.dbManager.getDb().prepare(`
            INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, created_at)
            VALUES ('asset-1', ?, NULL, 1, 100, 100, NULL, CURRENT_TIMESTAMP)
        `).run(path.join(tempDir, 'asset-1.png'));

        handleSystemCommand({
            id: 'cmd-selected-metadata',
            command: 'start_selected_subject_metadata_workflow',
            payload: {
                aiMode: 'live',
                imageStrategy: 'overview_plus_tiles',
                metadataPass: 'refine',
                selectedSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
            },
            dbManager: harness.dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: harness.collector.respond,
            workflowRuntime: { store: harness.store, orchestrator: harness.orchestrator, workflows: harness.workflows },
        });

        const response = await harness.collector.takeById('cmd-selected-metadata');
        const detail = harness.store.getRunDetail(response.data.runId);
        assert.equal(detail.parameters.imageStrategy, 'overview_plus_tiles');
        assert.equal(detail.parameters.metadataPass, 'refine');
        assert.equal(detail.parameters.aiMode, 'live');
    } finally {
        harness?.dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('workflow visualiser falls back to folder ingest for unknown workflow ids and exposes all registered workflows', async () => {
    const tempDir = createTempDir();
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let harness;

    try {
        harness = await createCommandHarness(tempDir);

        handleSystemCommand({
            id: 'cmd-unknown-workflow',
            command: 'get_workflow_visualiser',
            payload: { workflowId: 'missing_workflow_v1' },
            dbManager: harness.dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: harness.collector.respond,
            workflowRuntime: { store: harness.store, orchestrator: harness.orchestrator, workflows: harness.workflows },
        });

        const response = await harness.collector.takeById('cmd-unknown-workflow');
        assert.equal(response.status, 'ok');
        assert.equal(response.data.workflowId, 'folder_ingest_v1');
        assert.deepEqual(
            response.data.availableWorkflows.map((workflow) => workflow.workflowId),
            ['folder_ingest_v1', 'selected_subject_metadata_v1'],
        );
        assert.equal(response.data.availableWorkflows[0].displayName, 'Folder ingest');
        assert.equal(response.data.availableWorkflows[1].displayName, 'Selected subject metadata workflow');
    } finally {
        harness?.dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
