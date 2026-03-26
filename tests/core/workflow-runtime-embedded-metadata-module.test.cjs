const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-embedded-metadata-module-'));
}

function createFixtureImage(rootDir) {
    const imagePath = path.join(rootDir, 'one.png');
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6lrn8AAAAASUVORK5CYII=',
        'base64'
    );
    fs.writeFileSync(imagePath, pngBytes);
    return imagePath;
}

test('runtime.extract_embedded_metadata stores derived metadata and emits asset updated', async () => {
    const tempDir = createTempDir();
    const imagePath = createFixtureImage(tempDir);
    const emittedEvents = [];
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { createExtractEmbeddedMetadataModule } = await import('../../dist/core/src/services/workflowRuntime/modules/extractEmbeddedMetadataModule.js');
    let dbManager;

    try {
        dbManager = new DatabaseManager(tempDir);
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, metadata_timestamp_source, created_at)
            VALUES ('asset-1', ?, NULL, 67, 0, 0, NULL, NULL, '2026-03-20T00:00:00.000Z')
        `).run(imagePath);

        const moduleDefinition = createExtractEmbeddedMetadataModule({
            dbManager,
            eventBus: {
                emit(event) {
                    emittedEvents.push(event);
                },
            },
        });

        const result = await moduleDefinition.run({
            runId: 'run-1',
            subject: { subjectType: 'asset', subjectId: 'asset-1' },
            batchSubjects: [{ subjectType: 'asset', subjectId: 'asset-1' }],
            parameters: {},
        });

        assert.deepEqual(result.outputs, [{ kind: 'artifact', artifactType: 'embedded_metadata', subjectType: 'asset' }]);

        const assetRow = db.prepare(`
            SELECT width, height, exif_datetime, metadata_timestamp_source
            FROM assets
            WHERE id = 'asset-1'
        `).get();
        assert.equal(assetRow.width, 1);
        assert.equal(assetRow.height, 1);
        assert.equal(assetRow.metadata_timestamp_source, null);
        assert.equal(assetRow.exif_datetime, null);

        const metadataRow = db.prepare(`
            SELECT data
            FROM derived_results
            WHERE asset_id = 'asset-1' AND task = 'embedded_metadata'
        `).get();
        assert.ok(metadataRow);
        const stored = JSON.parse(metadataRow.data);
        assert.equal(stored.file.width, 1);
        assert.equal(stored.derived.timestamp_source, null);
        assert.ok(emittedEvents.some((event) => event.type === 'AssetUpdated' && event.assetId === 'asset-1'));
    } finally {
        dbManager?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
