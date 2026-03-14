const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-runtime-progress-'));
}

function createResponseCollector() {
    const responses = [];
    return {
        respond: (id, status, data, error) => {
            responses.push({ id, status, data, error });
        },
        takeLast() {
            const response = responses.at(-1);
            if (!response) {
                throw new Error('expected a response');
            }
            return response;
        },
    };
}

test('workflow run snapshot keeps preview total fixed while completed count advances', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { ExecutionStore } = await import('../../dist/core/src/services/workflowRuntime/executionStore.js');
    const { getWorkflowRunsSnapshot } = await import('../../dist/core/src/services/handlers/systemWorkflowRunSnapshot.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const store = new ExecutionStore(dbManager);
        const runId = store.createWorkflowRun({
            workflowId: 'folder_ingest_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'folder', subjectId: 'C:/photos' }],
            parameters: { traversalMode: 'recursive', aiMode: 'mock' },
        });

        const stepRunId = store.recordStepRun({
            workflowRunId: runId,
            nodeId: 'generate-previews',
            status: 'running',
            expectedItems: 400,
        });

        for (let index = 0; index < 40; index += 1) {
            store.recordSubjectExecution({
                workflowRunId: runId,
                stepRunId,
                subjectType: 'asset',
                subjectId: `asset-${index}`,
                status: 'completed',
            });
        }

        const [run] = getWorkflowRunsSnapshot(dbManager.getDb());
        const previewStep = run.stepSummaries.find((step) => step.nodeId === 'generate-previews');

        assert.ok(previewStep);
        assert.equal(previewStep.totalItems, 400);
        assert.equal(previewStep.completedItems, 40);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('get_assets returns newest imported assets first on page 0', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at)
            VALUES (?, ?, ?)
        `).run('asset-old', 'C:/photos/old.jpg', '2026-03-13T10:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at)
            VALUES (?, ?, ?)
        `).run('asset-new', 'C:/photos/new.jpg', '2026-03-13T10:00:05.000Z');

        handleSystemCommand({
            id: 'cmd-assets',
            command: 'get_assets',
            payload: { limit: 2, offset: 0, detailLevel: 'gallery' },
            dbManager,
            eventBus: { emit() {} },
            coordinator: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.deepEqual(response.data.assets.map((asset) => asset.id), ['asset-new', 'asset-old']);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('get_assets can prioritize previewed assets during active ingest refreshes', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at)
            VALUES (?, ?, ?)
        `).run('asset-early', 'C:/photos/early.jpg', '2026-03-13T10:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at)
            VALUES (?, ?, ?)
        `).run('asset-middle', 'C:/photos/middle.jpg', '2026-03-13T10:00:01.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at)
            VALUES (?, ?, ?)
        `).run('asset-late', 'C:/photos/late.jpg', '2026-03-13T10:00:02.000Z');
        db.prepare(`
            INSERT INTO previews (asset_id, size, path, version)
            VALUES (?, 'thumbnail', ?, 4)
        `).run('asset-early', 'C:/photos/previews/asset-early-thumbnail.webp');

        handleSystemCommand({
            id: 'cmd-assets-priority',
            command: 'get_assets',
            payload: { limit: 3, offset: 0, detailLevel: 'gallery', galleryOrder: 'previewed_first' },
            dbManager,
            eventBus: { emit() {} },
            coordinator: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.deepEqual(response.data.assets.map((asset) => asset.id), ['asset-early', 'asset-middle', 'asset-late']);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
