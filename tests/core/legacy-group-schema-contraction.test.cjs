const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-schema-contraction-'));
}

test('fresh databases record WP9 contraction and do not contain legacy asset group tables', () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const legacyTables = db.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name IN ('asset_groups', 'asset_group_members', 'asset_group_children')
            ORDER BY name
        `).all();
        assert.deepEqual(legacyTables, []);

        const migration = db.prepare(`
            SELECT id
            FROM schema_migrations
            WHERE id = '20260907_003_drop_legacy_asset_groups'
        `).get();
        assert.deepEqual(migration, { id: '20260907_003_drop_legacy_asset_groups' });
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
