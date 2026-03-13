const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-workflow-runtime-'));
}

test('execution store persists workflow runs and subject executions', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { ExecutionStore } = await import('../../dist/core/src/services/workflowRuntime/executionStore.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const store = new ExecutionStore(dbManager);

        const runId = store.createWorkflowRun({
            workflowId: 'asset-preview',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
        });

        store.recordStepRun({
            stepRunId: 'step-1',
            workflowRunId: runId,
            nodeId: 'generate-preview',
            status: 'running',
        });

        store.recordSubjectExecution({
            workflowRunId: runId,
            stepRunId: 'step-1',
            subjectType: 'asset',
            subjectId: 'asset-1',
            status: 'completed',
        });

        const summary = store.getRunSummary(runId);
        assert.equal(summary.workflowId, 'asset-preview');
        assert.equal(summary.totalItems, 1);
        assert.equal(summary.completedItems, 1);
        assert.equal(summary.failedItems, 0);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
