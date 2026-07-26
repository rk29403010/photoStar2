const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-library-grouping-command-'));
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

async function waitFor(predicate) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const result = predicate();
        if (result) {
            return result;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('timed out waiting for condition');
}

test('start_library_grouping launches the runtime grouping workflow across the full asset dataset', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { groupSimilarPhotosPlugin } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/group-similar-photos/plugin.js');
    const { libraryGroupingWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/libraryGroupingWorkflow.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime)
            VALUES
                ('asset-1', 'C:/photos/one.jpg', 'hash-1', 100, 10, 10, '2026-03-17T10:00:00.000Z'),
                ('asset-2', 'C:/photos/two.jpg', 'hash-2', 200, 11, 11, '2026-03-17T10:00:01.000Z')
        `).run();

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
        modules.registerPlugin(groupSimilarPhotosPlugin, { dbManager });
        workflows.register(libraryGroupingWorkflowDefinition);

        handleSystemCommand({
            id: 'cmd-start-grouping',
            command: 'start_library_grouping',
            payload: {},
            dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
            workflowRuntime: { store, orchestrator, workflows },
        });

        const startResponse = await collector.takeLast();
        assert.equal(startResponse.status, 'ok');
        assert.ok(startResponse.data.runId);
        assert.equal(startResponse.data.assetCount, 2);

        const detail = await waitFor(() => {
            const nextDetail = store.getRunDetail(startResponse.data.runId);
            return nextDetail.summary.status === 'completed' ? nextDetail : null;
        });
        assert.equal(detail.summary.workflowId, libraryGroupingWorkflowDefinition.id);
        assert.equal(detail.summary.totalItems, 1);
        assert.equal(detail.summary.completedItems, 1);
        assert.equal(detail.steps.length, 1);
        assert.equal(detail.steps[0].nodeId, 'group-library-assets');
        assert.equal(detail.steps[0].totalItems, 2);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
