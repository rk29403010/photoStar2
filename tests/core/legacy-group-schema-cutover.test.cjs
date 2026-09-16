const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-schema-cutover-'));
}

test('fresh databases omit legacy group tables after final WP9 contraction', () => {
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
            WHERE id = '20260908_001_contract_legacy_asset_groups'
        `).get();
        assert.deepEqual(migration, { id: '20260908_001_contract_legacy_asset_groups' });
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
