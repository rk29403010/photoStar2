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

test('get_assets can page oldest photos first for reverse-date gallery order', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1890', 'C:/photos/1890.jpg', '2026-03-13T10:00:00.000Z', '1890-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1970', 'C:/photos/1970.jpg', '2026-03-13T10:00:01.000Z', '1970-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1980', 'C:/photos/1980.jpg', '2026-03-13T10:00:02.000Z', '1980-06-01T00:00:00.000Z');

        handleSystemCommand({
            id: 'cmd-assets-oldest-first',
            command: 'get_assets',
            payload: { limit: 3, offset: 0, detailLevel: 'gallery', galleryOrder: 'oldest_first' },
            dbManager,
            eventBus: { emit() {} },
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.deepEqual(response.data.assets.map((asset) => asset.id), ['asset-1890', 'asset-1970', 'asset-1980']);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('get_stats returns whole-library timeline bounds, decade buckets, and unknown-date counts', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1895', 'C:/photos/1895.jpg', '2026-03-13T10:00:00.000Z', '1895-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1902', 'C:/photos/1902.jpg', '2026-03-13T10:00:01.000Z', '1902-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1954', 'C:/photos/1954.jpg', '2026-03-13T10:00:02.000Z', '1954-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1956', 'C:/photos/1956.jpg', '2026-03-13T10:00:03.000Z', '1956-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-unknown', 'C:/photos/unknown.jpg', '2026-03-13T10:00:04.000Z', null);

        handleSystemCommand({
            id: 'cmd-stats-timeline',
            command: 'get_stats',
            payload: {},
            dbManager,
            eventBus: { emit() {} },
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.equal(response.data.count, 5);
        assert.deepEqual(response.data.timeline, {
            firstPhotoDate: '1895-06-01T00:00:00.000Z',
            lastPhotoDate: '1956-06-01T00:00:00.000Z',
            datedPhotoCount: 4,
            unknownDateCount: 1,
            buckets: [
                {
                    label: '1890s',
                    startYear: 1890,
                    endYear: 1899,
                    startDate: '1890-01-01T00:00:00.000Z',
                    endDate: '1899-12-31T23:59:59.999Z',
                    count: 1,
                },
                {
                    label: '1900s',
                    startYear: 1900,
                    endYear: 1909,
                    startDate: '1900-01-01T00:00:00.000Z',
                    endDate: '1909-12-31T23:59:59.999Z',
                    count: 1,
                },
                {
                    label: '1950s',
                    startYear: 1950,
                    endYear: 1959,
                    startDate: '1950-01-01T00:00:00.000Z',
                    endDate: '1959-12-31T23:59:59.999Z',
                    count: 2,
                },
            ],
        });
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('get_assets can seek newest-first pages to a dated timeline anchor', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1940', 'C:/photos/1940.jpg', '2026-03-13T10:00:00.000Z', '1940-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1954', 'C:/photos/1954.jpg', '2026-03-13T10:00:01.000Z', '1954-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1957', 'C:/photos/1957.jpg', '2026-03-13T10:00:02.000Z', '1957-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1962', 'C:/photos/1962.jpg', '2026-03-13T10:00:03.000Z', '1962-06-01T00:00:00.000Z');

        handleSystemCommand({
            id: 'cmd-assets-seek-date-desc',
            command: 'get_assets',
            payload: {
                limit: 2,
                offset: 0,
                detailLevel: 'gallery',
                gallerySeek: { kind: 'dated', targetDate: '1959-12-31T23:59:59.999Z' },
            },
            dbManager,
            eventBus: { emit() {} },
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.deepEqual(response.data.assets.map((asset) => asset.id), ['asset-1957', 'asset-1954']);
        assert.equal(response.data.hasMore, true);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('get_assets can seek oldest-first pages to a dated timeline anchor and isolate unknown-date pages', async () => {
    const tempDir = createTempDir();
    const collector = createResponseCollector();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1940', 'C:/photos/1940.jpg', '2026-03-13T10:00:00.000Z', '1940-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1954', 'C:/photos/1954.jpg', '2026-03-13T10:00:01.000Z', '1954-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-1957', 'C:/photos/1957.jpg', '2026-03-13T10:00:02.000Z', '1957-06-01T00:00:00.000Z');
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-unknown-a', 'C:/photos/unknown-a.jpg', '2026-03-13T10:00:03.000Z', null);
        db.prepare(`
            INSERT INTO assets (id, original_path, created_at, photo_created_at)
            VALUES (?, ?, ?, ?)
        `).run('asset-unknown-b', 'C:/photos/unknown-b.jpg', '2026-03-13T10:00:04.000Z', null);

        handleSystemCommand({
            id: 'cmd-assets-seek-date-asc',
            command: 'get_assets',
            payload: {
                limit: 2,
                offset: 0,
                detailLevel: 'gallery',
                galleryOrder: 'oldest_first',
                gallerySeek: { kind: 'dated', targetDate: '1950-01-01T00:00:00.000Z' },
            },
            dbManager,
            eventBus: { emit() {} },
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const datedResponse = collector.takeLast();
        assert.equal(datedResponse.status, 'ok');
        assert.deepEqual(datedResponse.data.assets.map((asset) => asset.id), ['asset-1954', 'asset-1957']);

        handleSystemCommand({
            id: 'cmd-assets-seek-unknown',
            command: 'get_assets',
            payload: {
                limit: 5,
                offset: 0,
                detailLevel: 'gallery',
                gallerySeek: { kind: 'unknown' },
            },
            dbManager,
            eventBus: { emit() {} },
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const unknownResponse = collector.takeLast();
        assert.equal(unknownResponse.status, 'ok');
        assert.deepEqual(unknownResponse.data.assets.map((asset) => asset.id), ['asset-unknown-b', 'asset-unknown-a']);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
