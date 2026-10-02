const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
    createTempDir,
    seedAsset,
    seedAssetFeatures,
} = require('./workflow-runtime-grouping.helpers.cjs');

function seedReadyAsset(dbManager, id, visualHash, exifDate) {
    seedAsset(dbManager, {
        id,
        originalPath: `C:/photos/${id}.jpg`,
        fileHash: `hash-${id}`,
        fileSize: 1000,
        width: 1200,
        height: 800,
        exifDate,
    });
    seedAssetFeatures(dbManager, {
        assetId: id,
        fileHash: `hash-${id}`,
        phash64: visualHash,
        dhash64: visualHash,
    });
}

function snapshotProjectionRows(db) {
    return {
        observations: db.prepare(`
            SELECT asset_identity_guid_a, asset_identity_guid_b, policy, source_identity,
                   phash_distance, dhash_distance, score, evidence_json
            FROM visual_similarity_observations
            ORDER BY asset_identity_guid_a, asset_identity_guid_b, policy
        `).all(),
        sequences: db.prepare(`
            SELECT id, status, source_kind, source_identity, source_ref,
                   algorithm_version, params_json, evidence_json
            FROM capture_sequences
            ORDER BY id
        `).all(),
        members: db.prepare(`
            SELECT sequence_id, asset_identity_guid, ordinal, status, captured_at, evidence_json
            FROM capture_sequence_members
            ORDER BY sequence_id, ordinal
        `).all(),
    };
}

test('capture-sequence replacement rolls back deletion when a new proposal fails', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const repository = await import('../../dist/core/src/services/relationships/captureSequenceRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        seedReadyAsset(dbManager, 'asset-a', '0000000000000000', '2026-01-01T10:00:00.000Z');
        seedReadyAsset(dbManager, 'asset-b', '0000000000000001', '2026-01-01T10:00:01.000Z');
        const db = dbManager.getDb();
        const input = {
            impactedAssetIds: ['asset-a', 'asset-b'],
            sourceIdentity: 'test:burst',
            sequences: [{ members: [{ assetId: 'asset-a' }, { assetId: 'asset-b' }] }],
        };
        const [originalId] = repository.replaceSystemCaptureSequenceProposals(db, input);

        assert.throws(() => repository.replaceSystemCaptureSequenceProposals(db, {
            ...input,
            sequences: [{ members: [{ assetId: 'asset-a' }, { assetId: 'missing-asset' }] }],
        }), /Unknown asset 'missing-asset'/);
        assert.deepEqual(
            db.prepare('SELECT id FROM capture_sequences').all(),
            [{ id: originalId }],
        );
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM capture_sequence_members').get().count, 2);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('grouping recompute keeps all prior projections when burst publication fails', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const grouping = await import(
        '../../dist/core/src/services/workflowRuntime/modules/plugins/group-similar-photos/implementation.js'
    );
    const dbManager = new DatabaseManager(tempDir);

    try {
        seedReadyAsset(dbManager, 'asset-a', '0000000000000000', '2026-01-01T10:00:00.000Z');
        seedReadyAsset(dbManager, 'asset-b', '0000000000000001', '2026-01-01T10:00:01.000Z');
        seedReadyAsset(dbManager, 'asset-c', '00000000000000ff', '2026-01-01T10:00:02.000Z');
        const db = dbManager.getDb();
        grouping.syncGroupFreeDetectorOutputs(db, ['asset-a', 'asset-b', 'asset-c']);
        const before = snapshotProjectionRows(db);
        assert.ok(before.observations.length > 0);
        assert.equal(before.sequences.length, 1);

        db.prepare(`
            UPDATE asset_features
            SET phash64 = 'ffffffffffffffff', dhash64 = 'ffffffffffffffff'
            WHERE asset_id = 'asset-c'
        `).run();
        db.exec(`
            CREATE TRIGGER fail_burst_replacement
            BEFORE DELETE ON capture_sequences
            BEGIN
                SELECT RAISE(ABORT, 'forced burst publication failure');
            END;
        `);

        assert.throws(
            () => grouping.syncGroupFreeDetectorOutputs(db, ['asset-a', 'asset-b', 'asset-c']),
            /forced burst publication failure/,
        );
        assert.deepEqual(snapshotProjectionRows(db), before);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
