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
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-selection-metadata-'));
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

async function createHarness(tempDir, options = {}) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { expandSelectionPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/expand-selection/plugin.js');
    const { createGenerateAiMetadataScoutPluginModule: createGenerateAiMetadataScoutModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/generate-ai-metadata-scout/plugin.js');
    const { estimatePhotoDatePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/estimate-photo-date/plugin.js');
    const { detectPrintTexturePlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/detect-print-texture/plugin.js');
    const { selectedSubjectMetadataWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/selectedSubjectMetadataWorkflow.js');

    const dbManager = new DatabaseManager(tempDir);
    const db = dbManager.getDb();
    const assetOnePath = createAssetFile(tempDir, 'asset-one.jpg');
    const assetTwoPath = createAssetFile(tempDir, 'asset-two.jpg');
    db.prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, created_at)
        VALUES
        ('asset-1', ?, NULL, 1, 100, 100, NULL, CURRENT_TIMESTAMP),
        ('asset-2', ?, NULL, 1, 100, 100, NULL, CURRENT_TIMESTAMP)
    `).run(assetOnePath, assetTwoPath);

    const subjects = new runtime.SubjectRegistry();
    const modules = new runtime.ModuleRegistry();
    const workflows = new runtime.WorkflowRegistry({ subjects, modules });
    const store = new runtime.ExecutionStore(dbManager);

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

    modules.registerPlugin(expandSelectionPlugin);
    modules.register(createGenerateAiMetadataScoutModule({
        dbManager,
        aiRuntime: options.aiRuntime,
    }));
    modules.registerPlugin(estimatePhotoDatePlugin, { dbManager });
    modules.registerPlugin(detectPrintTexturePlugin, { dbManager });
    workflows.register(selectedSubjectMetadataWorkflowDefinition);

    const orchestrator = new runtime.WorkflowRuntimeOrchestrator({
        store,
        workflows,
        modules,
    });

    return { dbManager, orchestrator, store };
}

function createAssetFile(tempDir, fileName) {
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, 'selection-metadata-test');
    return filePath;
}

test('selected subject metadata workflow expands selected assets and de-duplicates repeated entries', async () => {
    const tempDir = createTempDir();
    let harness = null;

    try {
        harness = await createHarness(tempDir);
        const runId = await harness.orchestrator.start({
            workflowId: 'selected_subject_metadata_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'selection', subjectId: 'selection-1' }],
            parameters: {
                aiMode: 'mock',
                selectedSubjects: [
                    { subjectType: 'asset', subjectId: 'asset-1' },
                    { subjectType: 'asset', subjectId: 'asset-2' },
                    { subjectType: 'asset', subjectId: 'asset-1' },
                ],
            },
        });

        const rows = harness.dbManager.getDb().prepare(`
            SELECT asset_id, value_json
            FROM analysis_claims
            WHERE field = 'caption'
            ORDER BY asset_id ASC
        `).all();
        assert.equal(rows.length, 2);
        assert.deepEqual(rows.map((row) => row.asset_id), ['asset-1', 'asset-2']);

        const detail = harness.store.getRunDetail(runId);
        const expansionStep = detail.steps.find((step) => step.nodeId === 'expand-selection');
        assert.ok(expansionStep);
        assert.equal(expansionStep.totalItems, 1);
    } finally {
        harness?.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});

test('selected subject metadata workflow rejects unsupported non-asset subjects in v1', async () => {
    const tempDir = createTempDir();
    let harness = null;

    try {
        harness = await createHarness(tempDir);
        await assert.rejects(() => harness.orchestrator.start({
            workflowId: 'selected_subject_metadata_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'selection', subjectId: 'selection-2' }],
            parameters: {
                aiMode: 'mock',
                selectedSubjects: [
                    { subjectType: 'group', subjectId: 'group-1' },
                ],
            },
        }), /expand-selection/i);
    } finally {
        harness?.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});

test('selected workflow forwards targeted Refine concerns and persists only requested stage fields', async () => {
    const directory = createTempDir();
    let harness;
    const calls = [];
    const targets = [{ field: 'date', subjectId: null, question: 'Investigate clothing date', concern: 'date' }];
    try {
        const { persistAnalysisRun, loadAnalysis } = require('../../dist/core/src/services/photoAnalysis/repository.js');
        harness = await createHarness(directory, { aiRuntime: { async generateLiveMetadata(params) {
            calls.push({ pass: params.metadataPass, targets: params.targets, assetId: params.row.id });
            const sourceId = require('node:crypto').randomUUID();
            const result = { claims: [{ field: 'date', subjectId: null,
                value: { label: 'Circa 1990', start: '1985-01-01', end: '1995-12-31' },
                confidence: 'medium', kind: 'inferred_conclusion', sourceIds: [sourceId],
                evidence: [{ text: 'Period clothing', sourceIds: [sourceId] }], contradictions: [], supersedesId: null }],
                regions: [], refinementOpportunities: [] };
            const runId = persistAnalysisRun(params.dbManager, { assetId: params.row.id, stage: 'refine', provider: 'gemini',
                modelVersion: 'configurable-refine', promptVersion: 'evidence-1', targets: params.targets, result,
                sources: [{ id: sourceId, assetId: params.row.id, kind: 'local', refId: params.row.id, text: 'Injected evidence' }] });
            return { runId, result, analysis: loadAnalysis(params.dbManager, params.row.id), sources: [], images: [], faces: [] };
        } } });
        const runId = await harness.orchestrator.start({ workflowId: 'selected_subject_metadata_v1', triggerType: 'manual',
            inputSubjects: [{ subjectType: 'selection', subjectId: 'targeted-selection' }], parameters: {
                aiMode: 'live', metadataPass: 'refine', targets,
                selectedSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
            } });
        assert.deepEqual(calls, [{ pass: 'refine', targets, assetId: 'asset-1' }]);
        const analysis = loadAnalysis(harness.dbManager, 'asset-1');
        assert.deepEqual(analysis.runs.map(run => run.stage), ['refine']);
        assert.deepEqual(analysis.winners.map(claim => claim.field), ['date']);
        assert.equal(analysis.winners[0].evidence[0].text, 'Period clothing');
        assert.equal(harness.store.getRunDetail(runId).summary.status, 'completed');
        assert.equal(loadAnalysis(harness.dbManager, 'asset-2').runs.length, 0);
    } finally { harness?.dbManager.close(); await removeDirWithRetry(directory); }
});
