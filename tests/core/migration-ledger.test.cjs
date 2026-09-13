const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

function openMemoryDb() {
    return new Database(':memory:');
}

test('numbered migrations apply once and are recorded with a checksum', async () => {
    const { applyNumberedMigrations, calculateMigrationChecksum } = await import('../../dist/core/src/data/migrationLedger.js');
    const db = openMemoryDb();
    const migration = {
        id: '20260905-001-example',
        sql: 'CREATE TABLE example_migration_table (id TEXT PRIMARY KEY);',
    };

    try {
        applyNumberedMigrations(db, [migration]);
        applyNumberedMigrations(db, [migration]);

        const row = db.prepare('SELECT id, checksum, applied_at FROM schema_migrations WHERE id = ?')
            .get(migration.id);
        assert.equal(row.id, migration.id);
        assert.equal(row.checksum, calculateMigrationChecksum(migration));
        assert.ok(row.applied_at);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 1);
        assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'example_migration_table'").get());
    } finally {
        db.close();
    }
});

test('numbered migrations fail when an applied migration changes', async () => {
    const { applyNumberedMigrations } = await import('../../dist/core/src/data/migrationLedger.js');
    const db = openMemoryDb();

    try {
        applyNumberedMigrations(db, [{
            id: '20260905-002-checksum',
            sql: 'CREATE TABLE checksum_original (id TEXT PRIMARY KEY);',
        }]);

        assert.throws(() => applyNumberedMigrations(db, [{
            id: '20260905-002-checksum',
            sql: 'CREATE TABLE checksum_changed (id TEXT PRIMARY KEY);',
        }]), /changed after it was applied/);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 1);
    } finally {
        db.close();
    }
});

test('a failed numbered migration rolls back both schema changes and ledger entry', async () => {
    const { applyNumberedMigrations } = await import('../../dist/core/src/data/migrationLedger.js');
    const db = openMemoryDb();

    try {
        assert.throws(() => applyNumberedMigrations(db, [{
            id: '20260905-003-rollback',
            sql: `
                CREATE TABLE should_roll_back (id TEXT PRIMARY KEY);
                INSERT INTO missing_table (id) VALUES ('boom');
            `,
        }]));

        assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_roll_back'").get(), undefined);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 0);
    } finally {
        db.close();
    }
});

test('duplicate migration ids are rejected before application', async () => {
    const { applyNumberedMigrations } = await import('../../dist/core/src/data/migrationLedger.js');
    const db = openMemoryDb();

    try {
        assert.throws(() => applyNumberedMigrations(db, [
            { id: 'duplicate-id', sql: 'CREATE TABLE first_table (id TEXT);' },
            { id: 'duplicate-id', sql: 'CREATE TABLE second_table (id TEXT);' },
        ]), /Duplicate schema migration id/);
        assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'first_table'").get(), undefined);
    } finally {
        db.close();
    }
});

test('DatabaseManager initializes the numbered migration ledger without changing legacy migration behavior', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-migration-ledger-'));
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const table = dbManager.getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
        assert.equal(table.name, 'schema_migrations');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
