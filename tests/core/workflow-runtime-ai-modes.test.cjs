const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

require.cache[require.resolve('keytar')] = {
    id: require.resolve('keytar'), filename: require.resolve('keytar'), loaded: true,
    exports: { getPassword: async () => null, setPassword: async () => {}, deletePassword: async () => true },
};

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-folder-ai-modes-'));
}

function createFixtureFolder(rootDir, fileNames = ['one.png']) {
    const folderPath = path.join(rootDir, 'fixtures');
    fs.mkdirSync(folderPath, { recursive: true });
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4jwQYcHIAu4cj3WS55GoAAAAASUVORK5CYII=',
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
    const { scanFolderPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/scan-folder/plugin.js');
    const { generatePreviewsPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-previews/plugin.js');
    const { extractEmbeddedMetadataPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/extract-embedded-metadata/plugin.js');
    const { detectFacesPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-faces/plugin.js');
    const { detectFramesPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-frames/plugin.js');
    const { segmentObjectsPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/segment-objects/plugin.js');
    const { generateFaceVectorsPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-face-vectors/plugin.js');
    const { resolvePeoplePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/resolve-people/plugin.js');
    const { groupSimilarPhotosPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/group-similar-photos/plugin.js');
    const { detectSensitiveContentPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-sensitive-content/plugin.js');
    const { createGenerateAiMetadataScoutPluginModule: createGenerateAiMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-ai-metadata-scout/plugin.js');
    const { estimatePhotoDatePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/estimate-photo-date/plugin.js');
    const { detectPrintTexturePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-print-texture/plugin.js');
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
    modules.registerPlugin(segmentObjectsPlugin, { dbManager });
    modules.registerPlugin(generateFaceVectorsPlugin, { dbManager });
    modules.registerPlugin(resolvePeoplePlugin, { dbManager });
    modules.registerPlugin(groupSimilarPhotosPlugin, { dbManager });
    modules.registerPlugin(detectSensitiveContentPlugin, { dbManager });
    modules.register(createGenerateAiMetadataModule({
        dbManager,
        eventBus: options.eventBus,
        aiRuntime: options.aiRuntime,
        liveMetadataTimeoutMs: options.liveMetadataTimeoutMs,
    }));
    modules.registerPlugin(estimatePhotoDatePlugin, { dbManager });
    modules.registerPlugin(detectPrintTexturePlugin, { dbManager });
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

function analysisRuns(manager) {
    return manager.getDb().prepare('SELECT asset_id, stage, provider FROM analysis_runs ORDER BY rowid').all();
}

function liveRuntime(calls = []) {
    return { async generateLiveMetadata(params) {
        calls.push(params);
        const { persistAnalysisRun, loadAnalysis } = require('../../dist/core/src/services/photoAnalysis/repository.js');
        const sourceId = require('node:crypto').randomUUID();
        const result = { claims: [{ field: 'caption', subjectId: null, value: 'Live evidence caption', confidence: 'medium',
            kind: 'hypothesis', evidence: [], contradictions: [], sourceIds: [sourceId], supersedesId: null }],
            regions: [], refinementOpportunities: [] };
        const runId = persistAnalysisRun(params.dbManager, { assetId: params.row.id, stage: 'scout', provider: 'gemini',
            modelVersion: 'configurable-model', promptVersion: 'evidence-1', result,
            sources: [{ id: sourceId, assetId: params.row.id, kind: 'local', refId: params.row.id, text: 'Injected test evidence' }] });
        return { runId, result, analysis: loadAnalysis(params.dbManager, params.row.id), sources: [], images: [], faces: [] };
    } };
}

async function cleanup(harnesses, directory) {
    harnesses.forEach(harness => harness.dbManager.close());
    await removeDirWithRetry(directory);
}

test('folder ingest supports mock, live and off modes using stage claims', async () => {
    const directory = createTempDir();
    const folder = createFixtureFolder(directory);
    const harnesses = [];
    try {
        for (const mode of ['mock', 'off', 'live']) {
            const calls = [];
            const harness = await createHarness(path.join(directory, mode), { aiRuntime: liveRuntime(calls) });
            harnesses.push(harness);
            await runFolderIngest(harness, folder, { aiMode: mode });
            const runs = analysisRuns(harness.dbManager);
            assert.equal(runs.length, mode === 'off' ? 0 : 1);
            if (mode !== 'off') {assert.equal(runs[0].provider, mode === 'mock' ? 'runtime_stub' : 'gemini');}
            assert.equal(calls.length, mode === 'live' ? 1 : 0);
            assert.equal(harness.dbManager.getDb().prepare("SELECT COUNT(*) AS count FROM derived_results WHERE task = 'ai_metadata'").get().count, 0);
        }
    } finally { await cleanup(harnesses, directory); }
});

test('live ingest reports missing configuration as a failed workflow without analysis writes', async () => {
    const directory = createTempDir();
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const harnesses = [];
    try {
        const harness = await createHarness(path.join(directory, 'missing'));
        harnesses.push(harness);
        const folder = createFixtureFolder(directory, ['one.png', 'two.png']);
        await assert.rejects(runFolderIngest(harness, folder, { aiMode: 'live' }), /configured Gemini API key/);
        assert.equal(analysisRuns(harness.dbManager).length, 0);
        const summary = harness.dbManager.getDb().prepare('SELECT status FROM workflow_runs ORDER BY rowid DESC LIMIT 1').get();
        assert.equal(summary.status, 'failed');
        const step = harness.dbManager.getDb().prepare("SELECT status, error_message FROM step_runs WHERE node_id = 'generate-ai-metadata'").get();
        assert.equal(step.status, 'failed'); assert.match(step.error_message, /configured Gemini API key/);
    } finally {
        if (previous === undefined) {delete process.env.GEMINI_API_KEY;} else {process.env.GEMINI_API_KEY = previous;}
        await cleanup(harnesses, directory);
    }
});

test('timeout cancellation reaches live runtime and leaves the workflow failed', async () => {
    const directory = createTempDir();
    const harnesses = [];
    try {
        let receivedSignal;
        const harness = await createHarness(path.join(directory, 'cancel'), { liveMetadataTimeoutMs: 20,
            aiRuntime: { generateLiveMetadata: params => new Promise((resolve, reject) => {
                receivedSignal = params.signal;
                params.signal.addEventListener('abort', () => reject(params.signal.reason), { once: true });
            }) } });
        harnesses.push(harness);
        await assert.rejects(runFolderIngest(harness, createFixtureFolder(directory), { aiMode: 'live' }), /timeout|timed out/i);
        assert.equal(receivedSignal.aborted, true);
        assert.equal(analysisRuns(harness.dbManager).length, 0);
        assert.equal(harness.dbManager.getDb().prepare('SELECT status FROM workflow_runs ORDER BY rowid DESC LIMIT 1').get().status, 'failed');
    } finally { await cleanup(harnesses, directory); }
});

test('unsafe photos are skipped before external runtime invocation', async () => {
    const directory = createTempDir();
    const harnesses = [];
    try {
        const harness = await createHarness(path.join(directory, 'unsafe'));
        harnesses.push(harness);
        const db = harness.dbManager.getDb();
        db.prepare('INSERT INTO assets (id, original_path, sensitivity_score) VALUES (?, ?, ?)').run('unsafe', 'C:/unsafe.jpg', 90);
        const { createGenerateAiMetadataScoutPluginModule } = require('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-ai-metadata-scout/plugin.js');
        let calls = 0;
        const module = createGenerateAiMetadataScoutPluginModule({ dbManager: harness.dbManager,
            aiRuntime: { generateLiveMetadata: async () => { calls += 1; throw new Error('Must not call'); } } });
        assert.deepEqual(await module.run({ subject: { subjectType: 'asset', subjectId: 'unsafe' }, parameters: { aiMode: 'live' } }), { outputs: [] });
        assert.equal(calls, 0); assert.equal(analysisRuns(harness.dbManager).length, 0);
    } finally { await cleanup(harnesses, directory); }
});
