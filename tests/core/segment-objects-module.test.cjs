const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('segmentObjectsModule fails the module when its requested model is unavailable', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-segment-objects-module-'));
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { createSegmentObjectsModule } = await import('../../dist/core/src/services/workflowRuntime/modules/plugins/segment-objects/implementation.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare("INSERT INTO assets (id, original_path, created_at) VALUES ('asset-missing-model', ?, '2026-03-20T00:00:00.000Z')").run(__filename);
        const moduleDefinition = createSegmentObjectsModule({
            dbManager,
            providers: [{ id: 'fastsam', modelId: 'test', modelVersion: '1', capabilities: {}, isAvailable: () => false }],
        });

        await assert.rejects(
            moduleDefinition.run({ runId: 'run-missing-model', subject: { subjectType: 'asset', subjectId: 'asset-missing-model' }, batchSubjects: [], parameters: { provider: 'fastsam' } }),
            /required model is not installed/,
        );
        assert.equal(db.prepare("SELECT severity FROM processing_issues WHERE asset_id = 'asset-missing-model' AND task = 'object_segmentation'").get().severity, 'error');
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
