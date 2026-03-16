const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-face-boundary-'));
}

test('workflow-runtime face detections do not enqueue the legacy recognition pipeline', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { EventBus } = require('../../dist/core/src/services/events/bus.js');
    const { Coordinator } = require('../../dist/core/src/services/coordinator/index.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        dbManager.setSetting('workflow_modules_json', JSON.stringify(['face_pipeline']));
        dbManager.getDb().prepare(`
            INSERT INTO assets (id, original_path, width, height)
            VALUES (?, ?, 100, 100)
        `).run('asset-1', 'C:/tmp/asset-1.jpg');

        const eventBus = new EventBus(dbManager);
        const recognitionRequests = [];
        eventBus.subscribe('FaceRecognitionRequested', (event) => {
            recognitionRequests.push(event);
        });

        const coordinator = new Coordinator(eventBus, dbManager);
        assert.ok(coordinator);
        await delay(650);

        eventBus.emit({
            type: 'FacesDetected',
            mediaId: 'asset-1',
            faceCount: 1,
            source: 'workflow_runtime',
        });

        await delay(800);

        const queueRows = dbManager.getDb().prepare(`
            SELECT media_id, pipeline_stage, status
            FROM task_queue
            ORDER BY media_id ASC, pipeline_stage ASC
        `).all();

        assert.deepEqual(queueRows, []);
        assert.equal(recognitionRequests.length, 0);
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
