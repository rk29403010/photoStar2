const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-workflow-orchestrator-'));
}

test('orchestrator expands for_each and records aggregate progress', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const subjects = new runtime.SubjectRegistry();
        const modules = new runtime.ModuleRegistry();
        const workflows = new runtime.WorkflowRegistry({ subjects, modules });
        const store = new runtime.ExecutionStore(dbManager);

        subjects.register({
            id: 'asset',
            version: 1,
            durable: true,
            summary: { titleField: 'id', thumbnailStrategy: 'asset' },
            progressSemantics: 'per_subject',
            relations: [],
            ui: { detailSections: ['overview'] },
        });

        modules.register({
            id: 'fake.tag',
            version: 1,
            capability: 'derive',
            accepts: ['asset'],
            produces: [{ kind: 'artifact', artifactType: 'tag', subjectType: 'asset' }],
            run: async () => ({ outputs: [] }),
        });

        modules.register({
            id: 'fake.classify',
            version: 1,
            capability: 'derive',
            accepts: ['asset'],
            produces: [{ kind: 'artifact', artifactType: 'classification', subjectType: 'asset' }],
            run: async () => ({ outputs: [] }),
        });

        workflows.register({
            id: 'fake-two-step',
            version: 1,
            inputs: ['asset'],
            nodes: [
                { id: 'expand-assets', kind: 'control', controlType: 'for_each', step: 'test', outputsTo: ['tag-assets'] },
                { id: 'tag-assets', kind: 'module', moduleId: 'fake.tag', step: 'test', outputsTo: ['classify-assets'] },
                { id: 'classify-assets', kind: 'module', moduleId: 'fake.classify', step: 'test' },
            ],
        });

        const orchestrator = new runtime.WorkflowRuntimeOrchestrator({
            store,
            workflows,
            modules,
        });

        const runId = await orchestrator.start({
            workflowId: 'fake-two-step',
            triggerType: 'manual',
            inputSubjects: [
                { subjectType: 'asset', subjectId: 'asset-1' },
                { subjectType: 'asset', subjectId: 'asset-2' },
            ],
        });

        const summary = store.getRunSummary(runId);
        assert.equal(summary.workflowId, 'fake-two-step');
        assert.equal(summary.totalItems, 4);
        assert.equal(summary.completedItems, 4);
        assert.equal(summary.failedItems, 0);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
