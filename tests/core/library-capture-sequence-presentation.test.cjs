const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-sequence-presentation-'));
}

function seedAssets(db) {
    const insert = db.prepare(`
        INSERT INTO assets (
            id, original_path, file_hash, file_size, width, height,
            photo_created_at, created_at
        )
        VALUES (?, ?, ?, 1000, 1000, 800, ?, ?)
    `);
    insert.run('moment-a', 'C:/photos/a.jpg', 'hash-a', '2025-01-03T00:00:00.000Z', '2025-01-03T00:00:00.000Z');
    insert.run('moment-b', 'C:/photos/b.jpg', 'hash-b', '2025-01-02T00:00:00.000Z', '2025-01-02T00:00:00.000Z');
    insert.run('moment-c', 'C:/photos/c.jpg', 'hash-c', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
}

test('overlapping active CaptureSequences stay expanded instead of hiding an ambiguous moment', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const repository = await import('../../dist/core/src/services/relationships/captureSequenceRepository.js');
    const presentation = await import('../../dist/core/src/services/relationships/libraryCaptureSequencePresentationProjection.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAssets(db);
        repository.replaceSystemCaptureSequenceProposals(db, {
            impactedAssetIds: ['moment-a', 'moment-b'],
            sourceIdentity: 'test:sequence-a',
            sequences: [{
                members: [
                    { assetId: 'moment-a', capturedAt: '2025-01-01T10:00:00.000Z' },
                    { assetId: 'moment-b', capturedAt: '2025-01-01T10:00:01.000Z' },
                ],
            }],
        });
        repository.replaceSystemCaptureSequenceProposals(db, {
            impactedAssetIds: ['moment-b', 'moment-c'],
            sourceIdentity: 'test:sequence-b',
            sequences: [{
                members: [
                    { assetId: 'moment-b', capturedAt: '2025-01-01T10:00:01.000Z' },
                    { assetId: 'moment-c', capturedAt: '2025-01-01T10:00:02.000Z' },
                ],
            }],
        });

        const items = presentation.getCaptureSequencePresentationPage(db, { limit: 20, offset: 0 });
        assert.equal(presentation.countCaptureSequencePresentationItems(db), 3);
        assert.deepEqual(
            items.map((item) => item.representativeAssetId),
            ['moment-a', 'moment-b', 'moment-c'],
        );
        assert.equal(items.some((item) => item.relationshipKind === 'capture_sequence'), false);
        assert.deepEqual(items.map((item) => item.momentCount), [1, 1, 1]);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
