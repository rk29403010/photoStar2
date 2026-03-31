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

test('database startup reconciles stale running workflow rows into failed state', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO workflow_runs (
                id,
                workflow_id,
                trigger_type,
                status,
                input_subjects_json,
                parameters_json,
                started_at,
                created_at
            ) VALUES ('run-1', 'folder_ingest_v1', 'manual', 'running', '[]', '{}', '2026-03-28T10:00:00.000Z', '2026-03-28T10:00:00.000Z')
        `).run();
        db.prepare(`
            INSERT INTO step_runs (
                id,
                workflow_run_id,
                node_id,
                status,
                expected_items,
                error_message,
                created_at,
                updated_at
            ) VALUES (
                'step-1',
                'run-1',
                'generate-ai-metadata',
                'running',
                12,
                NULL,
                '2026-03-28T10:02:00.000Z',
                '2026-03-28T10:02:00.000Z'
            )
        `).run();
        dbManager.close();

        dbManager = new DatabaseManager(tempDir);
        const reopenedDb = dbManager.getDb();
        const runRow = reopenedDb.prepare(
            "SELECT status, finished_at FROM workflow_runs WHERE id = 'run-1'"
        ).get();
        const stepRow = reopenedDb.prepare(
            "SELECT status, error_message FROM step_runs WHERE id = 'step-1'"
        ).get();

        assert.equal(runRow.status, 'failed');
        assert.ok(runRow.finished_at);
        assert.equal(stepRow.status, 'failed');
        assert.match(stepRow.error_message, /interrupted|stalled|resume/i);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
