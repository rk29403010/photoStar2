const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

function createTempDir(prefix = 'photo-star-runtime-only-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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
            throw new Error('expected a command response');
        },
    };
}

function insertAsset(dbManager, assetId) {
    dbManager.getDb().prepare(`
        INSERT INTO assets (id, original_path, width, height)
        VALUES (?, ?, 100, 100)
    `).run(assetId, `C:/tmp/${assetId}.jpg`);
}

async function createRuntimeHarness(tempDir) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');

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
        id: 'asset',
        version: 1,
        durable: true,
        summary: { titleField: 'id', thumbnailStrategy: 'asset' },
        progressSemantics: 'per_subject',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'file', plural: 'files' },
    });

    const moduleIds = {
        previews: 'test.runtime.previews',
        faces: 'test.runtime.faces',
        sensitive: 'test.runtime.sensitive',
        metadata: 'test.runtime.metadata',
    };

    for (const moduleId of Object.values(moduleIds)) {
        modules.register({
            id: moduleId,
            version: 1,
            capability: 'derive',
            accepts: ['asset'],
            produces: [],
            run: async () => ({ outputs: [] }),
        });
    }

    workflows.register({
        id: 'library_previews_v1',
        version: 1,
        inputs: ['asset'],
        nodes: [{ id: 'generate-previews', kind: 'module', moduleId: moduleIds.previews }],
    });
    workflows.register({
        id: 'library_face_pipeline_v1',
        version: 1,
        inputs: ['asset'],
        nodes: [{ id: 'detect-faces', kind: 'module', moduleId: moduleIds.faces }],
    });
    workflows.register({
        id: 'library_sensitive_scan_v1',
        version: 1,
        inputs: ['asset'],
        nodes: [{ id: 'detect-sensitive-content', kind: 'module', moduleId: moduleIds.sensitive }],
    });
    workflows.register({
        id: 'library_ai_metadata_v1',
        version: 1,
        inputs: ['asset'],
        nodes: [{ id: 'generate-ai-metadata', kind: 'module', moduleId: moduleIds.metadata }],
    });

    return {
        dbManager,
        store,
        orchestrator,
        collector,
        handleSystemCommand,
        workflowRuntime: { store, orchestrator, workflows },
    };
}

function createCommandContext(harness, tempDir, command, payload = {}, id = `cmd-${Date.now()}`) {
    return {
        id,
        command,
        payload,
        dbManager: harness.dbManager,
        eventBus: {},
        activeJobs: new Map(),
        LIB_DIR: tempDir,
        respond: harness.collector.respond,
        workflowRuntime: harness.workflowRuntime,
    };
}

async function waitForRunCompletion(harness, runId) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const detail = harness.store.getRunDetail(runId);
        if (detail.summary.status === 'completed' || detail.summary.status === 'failed') {
            return detail;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error(`workflow run '${runId}' did not finish in time`);
}

test('runtime-only library workflow commands start the expected workflow definitions', async () => {
    const tempDir = createTempDir();
    let harness;

    try {
        harness = await createRuntimeHarness(tempDir);
        insertAsset(harness.dbManager, 'asset-1');
        insertAsset(harness.dbManager, 'asset-2');

        const cases = [
            { command: 'start_library_preview_workflow', workflowId: 'library_previews_v1', payload: {} },
            { command: 'start_library_face_workflow', workflowId: 'library_face_pipeline_v1', payload: {} },
            { command: 'start_library_sensitive_scan_workflow', workflowId: 'library_sensitive_scan_v1', payload: {} },
            { command: 'start_library_ai_metadata_workflow', workflowId: 'library_ai_metadata_v1', payload: { aiMode: 'mock' } },
        ];

        for (const testCase of cases) {
            harness.handleSystemCommand(createCommandContext(harness, tempDir, testCase.command, testCase.payload));
            const response = await harness.collector.takeLast();
            assert.equal(response.status, 'ok');
            assert.ok(response.data.runId, `expected run id for ${testCase.command}`);

            const detail = await waitForRunCompletion(harness, response.data.runId);
            assert.equal(detail.summary.workflowId, testCase.workflowId);
            assert.equal(detail.summary.totalItems, 2);
            assert.equal(detail.summary.completedItems, 2);
        }
    } finally {
        harness?.dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('runtime-only ai metadata command scopes to a single asset when mediaId is provided', async () => {
    const tempDir = createTempDir();
    let harness;

    try {
        harness = await createRuntimeHarness(tempDir);
        insertAsset(harness.dbManager, 'asset-1');
        insertAsset(harness.dbManager, 'asset-2');

        harness.handleSystemCommand(createCommandContext(
            harness,
            tempDir,
            'start_library_ai_metadata_workflow',
            { aiMode: 'mock', mediaId: 'asset-2' }
        ));
        const response = await harness.collector.takeLast();
        assert.equal(response.status, 'ok');

        const detail = await waitForRunCompletion(harness, response.data.runId);
        assert.equal(detail.summary.workflowId, 'library_ai_metadata_v1');
        assert.equal(detail.summary.totalItems, 1);
        assert.equal(detail.summary.completedItems, 1);
    } finally {
        harness?.dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('database startup removes legacy workflow queue tables and settings', () => {
    const tempDir = createTempDir('photo-star-runtime-only-db-');
    const dbPath = path.join(tempDir, 'library.db');
    const legacyDb = new Database(dbPath);

    legacyDb.exec(`
        CREATE TABLE task_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id TEXT NOT NULL,
            pipeline_stage TEXT NOT NULL
        );
        CREATE TABLE settings (
            id TEXT PRIMARY KEY,
            value TEXT
        );
        INSERT INTO settings (id, value) VALUES
            ('workflow_modules_json', '["legacy"]'),
            ('workflow_stage_overrides_json', '{"stages":{}}'),
            ('dashboard_paused_modules_json', '["class-previews"]');
    `);
    legacyDb.close();

    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const taskQueueTable = dbManager.getDb().prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = 'task_queue'
        `).get();
        assert.equal(taskQueueTable, undefined);

        const legacySettings = dbManager.getDb().prepare(`
            SELECT id
            FROM settings
            WHERE id IN ('workflow_modules_json', 'workflow_stage_overrides_json', 'dashboard_paused_modules_json')
        `).all();
        assert.deepEqual(legacySettings, []);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('get_system_jobs returns workflow-native dashboard data without queue status', async () => {
    const tempDir = createTempDir();
    let harness;

    try {
        harness = await createRuntimeHarness(tempDir);
        insertAsset(harness.dbManager, 'asset-1');

        harness.handleSystemCommand(createCommandContext(harness, tempDir, 'start_library_preview_workflow'));
        const startResponse = await harness.collector.takeLast();
        await waitForRunCompletion(harness, startResponse.data.runId);

        harness.handleSystemCommand(createCommandContext(harness, tempDir, 'get_system_jobs', {}, 'cmd-system-jobs'));
        const response = await harness.collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.equal('queueStatus' in response.data, false);
        assert.ok(response.data.workflowStatus);
        assert.ok(Array.isArray(response.data.workflowRuns));
        assert.ok(response.data.workflowRuns.some((run) => run.workflowId === 'library_previews_v1'));
    } finally {
        harness?.dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
