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

test('reset_grouping_data removes automatic and manual grouping state without touching assets', async () => {
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
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
