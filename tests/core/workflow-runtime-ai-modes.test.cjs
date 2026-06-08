const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-folder-ai-modes-'));
}

function createFixtureFolder(rootDir, fileNames = ['one.png']) {
    const folderPath = path.join(rootDir, 'fixtures');
    fs.mkdirSync(folderPath, { recursive: true });
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6lrn8AAAAASUVORK5CYII=',
        'base64'
    );
    for (const fileName of fileNames) {
        fs.writeFileSync(path.join(folderPath, fileName), pngBytes);
    }
    return folderPath;
}

async function removeDirWithRetry(targetPath) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return;
        } catch (error) {
            if (attempt === 4) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        }
    }
}

async function createHarness(tempDir, options = {}) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { createScanFolderModule } = await import('../../dist/core/src/services/workflowRuntime/modules/scanFolderModule.js');
    const { createGeneratePreviewsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generatePreviewsModule.js');
    const { createExtractEmbeddedMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/extractEmbeddedMetadataModule.js');
    const { createDetectFacesModule } = await import('../../dist/core/src/services/workflowRuntime/modules/detectFacesModule.js');
    const { createDetectFramesModule } = await import('../../dist/core/src/services/workflowRuntime/modules/detectFramesModule.js');
    const { createGenerateFaceVectorsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateFaceVectorsModule.js');
    const { createResolvePeopleModule } = await import('../../dist/core/src/services/workflowRuntime/modules/resolvePeopleModule.js');
    const { createGroupSimilarPhotosModule } = await import('../../dist/core/src/services/workflowRuntime/modules/groupSimilarPhotosModule.js');
    const { createDetectSensitiveContentModule } = await import('../../dist/core/src/services/workflowRuntime/modules/detectSensitiveContentModule.js');
    const { createGenerateAiMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/index.js');
    const { createEstimatePhotoDateModule } = await import('../../dist/core/src/services/workflowRuntime/modules/estimatePhotoDateModule.js');
    const { folderIngestWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/folderIngestWorkflow.js');

    const dbManager = new DatabaseManager(tempDir);
    if (options.apiKey) {
        dbManager.setSetting('ai_metadata_v2_api_key', options.apiKey);
    }
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
    modules.register(createDetectFramesModule({ dbManager }));
    modules.register(createGenerateFaceVectorsModule({ dbManager }));
    modules.register(createResolvePeopleModule({ dbManager }));
    modules.register(createGroupSimilarPhotosModule({ dbManager }));
    modules.register(createDetectSensitiveContentModule({ dbManager }));
    modules.register(createGenerateAiMetadataModule({
        dbManager,
        eventBus: options.eventBus,
        aiRuntime: options.aiRuntime,
        liveMetadataTimeoutMs: options.liveMetadataTimeoutMs,
    }));
    modules.register(createEstimatePhotoDateModule({ dbManager }));
    workflows.register(folderIngestWorkflowDefinition);

    const orchestrator = new runtime.WorkflowRuntimeOrchestrator({
        store,
        workflows,
        modules,
    });

    return { dbManager, orchestrator, store };
}

async function runFolderIngest(harness, folderPath, parameters = {}) {
    await harness.orchestrator.start({
        workflowId: 'folder_ingest_v1',
        triggerType: 'manual',
        inputSubjects: [{ subjectType: 'folder', subjectId: folderPath }],
        parameters: {
            folderPath,
            traversalMode: 'folder_only',
            ...parameters,
        },
    });
}

function readDerivedResultRow(dbManager, task) {
    return dbManager.getDb().prepare(
        `SELECT provider, model_version, data FROM derived_results WHERE task = ? LIMIT 1`
    ).get(task);
}

function createLiveAiRuntime() {
    return {
        async generateLiveMetadata(params) {
            assert.equal(params.imageStrategy, 'overview_plus_tiles');
            return {
                provider: 'google',
                modelVersion: 'gemini-3.1-pro-preview',
                data: {
                    caption: 'Restored live caption',
                    keywords: ['archive', 'family'],
                    _analysis_tier: 'pro',
                },
            };
        },
    };
}

async function cleanupHarnesses(harnesses, tempDir) {
    for (const harness of harnesses) {
        try {
            harness.dbManager.close();
        } catch {
            // ignore close failures during cleanup
        }
    }
    try {
        await removeDirWithRetry(tempDir);
    } catch {
        // Windows can keep SQLite sidecar handles briefly; cleanup is best-effort here.
    }
}

test('folder ingest supports mock, live, and off ai modes', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir);
    const harnesses = [];

    try {
        const mockHarness = await createHarness(path.join(tempDir, 'mock'));
        harnesses.push(mockHarness);
        await runFolderIngest(mockHarness, folderPath, { aiMode: 'mock' });

        const mockRow = readDerivedResultRow(mockHarness.dbManager, 'ai_metadata');
        assert.ok(mockRow);
        assert.equal(JSON.parse(mockRow.data).mode, 'mock');

        const offHarness = await createHarness(path.join(tempDir, 'off'));
        harnesses.push(offHarness);
        await runFolderIngest(offHarness, folderPath, { aiMode: 'off' });

        const offCount = offHarness.dbManager.getDb().prepare(
            "SELECT COUNT(*) AS count FROM derived_results WHERE task = 'ai_metadata'"
        ).get();
        assert.equal(offCount.count, 0);

        const liveHarness = await createHarness(path.join(tempDir, 'live'), {
            apiKey: 'AIzaSyDUMMYKEY12345678901234567890',
            aiRuntime: createLiveAiRuntime(),
        });
        harnesses.push(liveHarness);
        await runFolderIngest(liveHarness, folderPath, {
            aiMode: 'live',
            imageStrategy: 'overview_plus_tiles',
        });

        const liveRow = readDerivedResultRow(liveHarness.dbManager, 'ai_metadata');
        assert.ok(liveRow);
        assert.equal(liveRow.provider, 'google');
        assert.equal(liveRow.model_version, 'gemini-3.1-pro-preview');
        assert.equal(JSON.parse(liveRow.data).caption, 'Restored live caption');
    } finally {
        await cleanupHarnesses(harnesses, tempDir);
    }
});

test('live ai mode without an api key emits one configuration error and stops further metadata processing', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir, ['one.png', 'two.png']);
    const emittedEvents = [];
    let harness = null;

    try {
        harness = await createHarness(path.join(tempDir, 'missing-key'), {
            eventBus: {
                emit(event) {
                    emittedEvents.push(event);
                },
            },
        });

        await assert.rejects(
            harness.orchestrator.start({
                workflowId: 'folder_ingest_v1',
                triggerType: 'manual',
                inputSubjects: [{ subjectType: 'folder', subjectId: folderPath }],
                parameters: {
                    folderPath,
                    traversalMode: 'folder_only',
                    aiMode: 'live',
                },
            }),
            /workflow step 'generate-ai-metadata' failed/,
        );

        const metadataWrites = harness.dbManager.getDb().prepare(
            "SELECT COUNT(*) AS count FROM derived_results WHERE task = 'ai_metadata'"
        ).get();
        assert.equal(metadataWrites.count, 0);

        const detail = harness.store.getRunDetail(
            harness.dbManager.getDb().prepare(
                "SELECT id FROM workflow_runs ORDER BY created_at DESC, id DESC LIMIT 1"
            ).get().id
        );
        const metadataStep = detail.steps.find((step) => step.nodeId === 'generate-ai-metadata');
        assert.ok(metadataStep);
        assert.equal(metadataStep.failedItems, 2);
        assert.equal(metadataStep.completedItems, 0);
        assert.equal(
            metadataStep.errorMessage,
            'Live AI metadata requires a configured Gemini API key. Add one in Settings before running live ingest.',
        );

        assert.deepEqual(
            emittedEvents.filter((event) => event.type === 'AiMetadataConfigurationError').map((event) => event.message),
            ['Live AI metadata requires a configured Gemini API key. Add one in Settings before running live ingest.'],
        );
    } finally {
        try {
            harness?.dbManager.close();
        } catch {
            // ignore close failures during cleanup
        }
        try {
            await removeDirWithRetry(tempDir);
        } catch {
            // Windows can keep SQLite sidecar handles briefly; cleanup is best-effort here.
        }
    }
});

test('hung live ai metadata fails the workflow with a timeout instead of leaving the run stuck', async () => {
    const tempDir = createTempDir();
    const folderPath = createFixtureFolder(tempDir, ['one.png']);
    let harness = null;

    try {
        harness = await createHarness(path.join(tempDir, 'hung-live'), {
            apiKey: 'AIzaSyDUMMYKEY12345678901234567890',
            liveMetadataTimeoutMs: 20,
            aiRuntime: {
                async generateLiveMetadata() {
                    return await new Promise(() => {});
                },
            },
        });

        await assert.rejects(
            harness.orchestrator.start({
                workflowId: 'folder_ingest_v1',
                triggerType: 'manual',
                inputSubjects: [{ subjectType: 'folder', subjectId: folderPath }],
                parameters: {
                    folderPath,
                    traversalMode: 'folder_only',
                    aiMode: 'live',
                },
            }),
            /timed out/i,
        );

        const runId = harness.dbManager.getDb().prepare(
            "SELECT id FROM workflow_runs ORDER BY created_at DESC, id DESC LIMIT 1"
        ).get().id;
        const detail = harness.store.getRunDetail(runId);
        const metadataStep = detail.steps.find((step) => step.nodeId === 'generate-ai-metadata');

        assert.equal(detail.summary.status, 'failed');
        assert.ok(metadataStep);
        assert.equal(metadataStep.status, 'failed');
        assert.match(metadataStep.errorMessage, /timed out/i);
    } finally {
        try {
            harness?.dbManager.close();
        } catch {
            // ignore close failures during cleanup
        }
        try {
            await removeDirWithRetry(tempDir);
        } catch {
            // Windows can keep SQLite sidecar handles briefly; cleanup is best-effort here.
        }
    }
});
