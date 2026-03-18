const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-recognition-removal-'));
}

function createResponseCollector() {
    const responses = [];
    return {
        respond: (id, status, data, error) => {
            responses.push({ id, status, data, error });
        },
        get responses() {
            return responses;
        },
    };
}

test('recognise_faces command is removed from the backend command surface', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const collector = createResponseCollector();
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);

        assert.throws(() => {
            handleSystemCommand({
                id: 'cmd-recog',
                command: 'recognise_faces',
                payload: {},
                dbManager,
                eventBus: {},
                activeJobs: new Map(),
                LIB_DIR: tempDir,
                respond: collector.respond,
                workflowRuntime: { store: {}, orchestrator: {} },
            });
        }, /Unknown command: recognise_faces/);

        assert.equal(collector.responses.length, 0);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('get_system_jobs no longer includes a legacy face recognition card', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const collector = createResponseCollector();
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);

        handleSystemCommand({
            id: 'cmd-system-jobs',
            command: 'get_system_jobs',
            payload: {},
            dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
            workflowRuntime: { store: {}, orchestrator: {} },
        });

        const response = collector.responses.at(-1);
        assert.equal(response.status, 'ok');
        assert.ok(Array.isArray(response.data.jobs));
        assert.equal(response.data.jobs.some((job) => job.id === 'class-mapping'), false);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
