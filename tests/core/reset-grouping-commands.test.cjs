const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-reset-grouping-'));
}

function createResponseCollector() {
    const responses = [];
    return {
        respond: (id, status, data, error) => {
            responses.push({ id, status, data, error });
        },
        takeLast() {
            const response = responses.at(-1);
            if (!response) {
                throw new Error('expected a command response');
            }
            return response;
        },
    };
}

function count(db, tableName) {
    return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

function seedCaptureSequence(db, id, status, sourceKind, sourceIdentity) {
    db.prepare(`
        INSERT INTO capture_sequences (
            id, status, source_kind, source_identity, source_ref, algorithm_version, params_json
        )
        VALUES (?, ?, ?, ?, 'test', '1.0', '{}')
    `).run(id, status, sourceKind, sourceIdentity);
    db.prepare(`
        INSERT INTO capture_sequence_members (sequence_id, asset_identity_guid, ordinal, status)
        VALUES (?, 'identity-1', 0, 'candidate')
    `).run(id);
}

function seedVisualObservation(db, sourceIdentity) {
    db.prepare(`
        INSERT INTO visual_similarity_observations (
            asset_identity_guid_a,
            asset_identity_guid_b,
            source_identity,
            source_ref,
            algorithm_version,
            phash_distance,
            dhash_distance,
            score
        )
        VALUES ('identity-1', 'identity-2', ?, 'test', '1.0', 1, 2, 0.96875)
    `).run(sourceIdentity);
}

test('reset_grouping_data clears detector state but preserves reviewed semantic sequences and assets', async () => {
    const tempDir = createTempDir();
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);
    const collector = createResponseCollector();

    try {
        const db = dbManager.getDb();
        db.prepare(`
            INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime)
            VALUES
                ('asset-1', 'C:/photos/one.jpg', 'hash-1', 100, 10, 10, '2026-03-17T10:00:00.000Z'),
                ('asset-2', 'C:/photos/two.jpg', 'hash-2', 200, 11, 11, '2026-03-17T10:00:01.000Z')
        `).run();
        db.prepare(`
            INSERT INTO asset_identities (guid, original_path)
            VALUES
                ('identity-1', 'C:/photos/one.jpg'),
                ('identity-2', 'C:/photos/two.jpg')
        `).run();
        db.prepare(`
            INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
            VALUES
                ('group-auto', 'variant_set', 'proposed', 'asset-1', '1.0', '{}'),
                ('group-manual', 'duplicate', 'locked', 'asset-2', '1.0', '{}')
        `).run();
        db.prepare(`
            INSERT INTO asset_group_members (group_id, asset_id, role, rank)
            VALUES
                ('group-auto', 'asset-1', 'canonical', 0),
                ('group-auto', 'asset-2', 'member', 1),
                ('group-manual', 'asset-2', 'canonical', 0)
        `).run();
        db.prepare(`
            INSERT INTO asset_similarity_edges (asset_id_a, asset_id_b, kind, score, reason, algorithm_version)
            VALUES ('asset-1', 'asset-2', 'visual', 0.91, 'phash', '1.0')
        `).run();
        seedVisualObservation(db, 'runtime.group_similar_photos:visual_hash');
        seedVisualObservation(db, 'manual:comparison');
        seedCaptureSequence(
            db,
            'sequence-system-proposed',
            'proposed',
            'system',
            'runtime.group_similar_photos:burst',
        );
        seedCaptureSequence(
            db,
            'sequence-system-accepted',
            'accepted',
            'system',
            'runtime.group_similar_photos:burst',
        );
        seedCaptureSequence(
            db,
            'sequence-human-proposed',
            'proposed',
            'human',
            'family:robin',
        );

        handleSystemCommand({
            id: 'cmd-reset-grouping',
            command: 'reset_grouping_data',
            payload: {},
            dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: collector.respond,
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.equal(count(db, 'assets'), 2);
        assert.equal(count(db, 'asset_groups'), 0);
        assert.equal(count(db, 'asset_group_members'), 0);
        assert.equal(count(db, 'asset_similarity_edges'), 0);
        assert.deepEqual(
            db.prepare('SELECT source_identity FROM visual_similarity_observations ORDER BY source_identity').all(),
            [{ source_identity: 'manual:comparison' }],
        );
        assert.deepEqual(
            db.prepare('SELECT id, status, source_kind FROM capture_sequences ORDER BY id').all(),
            [
                { id: 'sequence-human-proposed', status: 'proposed', source_kind: 'human' },
                { id: 'sequence-system-accepted', status: 'accepted', source_kind: 'system' },
            ],
        );
        assert.equal(count(db, 'capture_sequence_members'), 2);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
