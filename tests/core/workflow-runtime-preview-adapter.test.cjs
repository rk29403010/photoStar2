const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-workflow-preview-'));
}

test('asset preview workflow wraps a preview adapter module and completes', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
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
        const previewCalls = [];

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
            runPreview: async (mediaIds) => {
                previewCalls.push([...mediaIds]);
            },
        }));
        workflows.register(assetPreviewWorkflowDefinition);

        const orchestrator = new runtime.WorkflowRuntimeOrchestrator({
            store,
            workflows,
            modules,
        });

        const runId = await orchestrator.start({
            workflowId: assetPreviewWorkflowDefinition.id,
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
        });

        const summary = store.getRunSummary(runId);
        assert.deepEqual(previewCalls, [['asset-1']]);
        assert.equal(summary.workflowId, assetPreviewWorkflowDefinition.id);
        assert.equal(summary.completedItems, 1);
        assert.equal(summary.failedItems, 0);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
