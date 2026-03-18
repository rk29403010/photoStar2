const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-workflow-commands-'));
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

test('workflow runtime commands start a run and return drill-down summaries', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { createPreviewAdapterModule } = await import('../../dist/core/src/services/workflowRuntime/modules/previewAdapterModule.js');
    const { assetPreviewWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/assetPreviewWorkflow.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
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
        });
        modules.register(createPreviewAdapterModule({
            runPreview: async () => undefined,
        }));
        workflows.register(assetPreviewWorkflowDefinition);

        handleSystemCommand({
            id: 'cmd-1',
            command: 'start_workflow_run',
            payload: {
                workflowId: assetPreviewWorkflowDefinition.id,
                triggerType: 'manual',
                inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
            },
            dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
            workflowRuntime: { store, orchestrator },
        });

        const startResponse = await collector.takeLast();
        assert.equal(startResponse.status, 'ok');
        assert.ok(startResponse.data.runId);

        handleSystemCommand({
            id: 'cmd-2',
            command: 'get_workflow_run_detail',
            payload: {
                runId: startResponse.data.runId,
            },
            dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
            workflowRuntime: { store, orchestrator },
        });

        const detailResponse = await collector.takeLast();
        assert.equal(detailResponse.status, 'ok');
        assert.equal(detailResponse.data.summary.totalItems, 1);
        assert.equal(detailResponse.data.summary.completedItems, 1);
        assert.equal(detailResponse.data.steps.length, 1);
        assert.equal(detailResponse.data.steps[0].nodeId, 'generate-preview');
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
