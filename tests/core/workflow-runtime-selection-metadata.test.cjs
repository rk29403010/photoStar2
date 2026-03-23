const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-selection-metadata-'));
}

async function removeDirWithRetry(targetPath) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return;
        } catch (error) {
            if (attempt === 4) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        }
    }
}

async function createHarness(tempDir) {
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const runtime = await import('../../dist/core/src/services/workflowRuntime/index.js');
    const { createExpandSelectionModule } = await import('../../dist/core/src/services/workflowRuntime/modules/expandSelectionModule.js');
    const { createGenerateAiMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadataModule.js');
    const { selectedSubjectMetadataWorkflowDefinition } = await import('../../dist/core/src/services/workflowRuntime/workflows/selectedSubjectMetadataWorkflow.js');

    const dbManager = new DatabaseManager(tempDir);
    const db = dbManager.getDb();
    db.prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, created_at)
        VALUES
        ('asset-1', 'C:/photos/one.jpg', NULL, 1, 100, 100, NULL, CURRENT_TIMESTAMP),
        ('asset-2', 'C:/photos/two.jpg', NULL, 1, 100, 100, NULL, CURRENT_TIMESTAMP)
    `).run();

    const subjects = new runtime.SubjectRegistry();
    const modules = new runtime.ModuleRegistry();
    const workflows = new runtime.WorkflowRegistry({ subjects, modules });
    const store = new runtime.ExecutionStore(dbManager);

    subjects.register({
        id: 'selection',
        version: 1,
        durable: false,
        summary: { titleField: 'id', thumbnailStrategy: 'none' },
        progressSemantics: 'aggregate',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'selection', plural: 'selections' },
    });
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

    modules.register(createExpandSelectionModule());
    modules.register(createGenerateAiMetadataModule({ dbManager }));
    workflows.register(selectedSubjectMetadataWorkflowDefinition);

    const orchestrator = new runtime.WorkflowRuntimeOrchestrator({
        store,
        workflows,
        modules,
    });

    return { dbManager, orchestrator, store };
}

test('selected subject metadata workflow expands selected assets and de-duplicates repeated entries', async () => {
    const tempDir = createTempDir();
    let harness = null;

    try {
        harness = await createHarness(tempDir);
        const runId = await harness.orchestrator.start({
            workflowId: 'selected_subject_metadata_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'selection', subjectId: 'selection-1' }],
            parameters: {
                aiMode: 'mock',
                selectedSubjects: [
                    { subjectType: 'asset', subjectId: 'asset-1' },
                    { subjectType: 'asset', subjectId: 'asset-2' },
                    { subjectType: 'asset', subjectId: 'asset-1' },
                ],
            },
        });

        const rows = harness.dbManager.getDb().prepare(`
            SELECT asset_id, data
            FROM derived_results
            WHERE task = 'ai_metadata'
            ORDER BY asset_id ASC
        `).all();
        assert.equal(rows.length, 2);
        assert.deepEqual(rows.map((row) => row.asset_id), ['asset-1', 'asset-2']);

        const detail = harness.store.getRunDetail(runId);
        const expansionStep = detail.steps.find((step) => step.nodeId === 'expand-selection');
        assert.ok(expansionStep);
        assert.equal(expansionStep.totalItems, 1);
    } finally {
        harness?.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});

test('selected subject metadata workflow rejects unsupported non-asset subjects in v1', async () => {
    const tempDir = createTempDir();
    let harness = null;

    try {
        harness = await createHarness(tempDir);
        await assert.rejects(() => harness.orchestrator.start({
            workflowId: 'selected_subject_metadata_v1',
            triggerType: 'manual',
            inputSubjects: [{ subjectType: 'selection', subjectId: 'selection-2' }],
            parameters: {
                aiMode: 'mock',
                selectedSubjects: [
                    { subjectType: 'group', subjectId: 'group-1' },
                ],
            },
        }), /expand-selection/i);
    } finally {
        harness?.dbManager.close();
        await removeDirWithRetry(tempDir);
    }
});
