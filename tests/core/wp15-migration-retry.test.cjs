const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

test('legacy migrations use schema state for supported compatibility cases', async () => {
    const { SCHEMA_SQL } = await import('../../dist/core/src/data/dbSchema.js');
    const { applyLegacyMigrations } = await import('../../dist/core/src/data/legacyMigrationCompatibility.js');
    const db = new Database(':memory:');

    try {
        db.exec(SCHEMA_SQL);
        applyLegacyMigrations(db);
        applyLegacyMigrations(db);

        const assetColumns = db.prepare('PRAGMA table_info(assets)').all().map((row) => row.name);
        assert.ok(assetColumns.includes('caption'));
        const jobColumns = db.prepare('PRAGMA table_info(jobs)').all().map((row) => row.name);
        assert.ok(jobColumns.includes('stage'));
        assert.equal(jobColumns.includes('type'), false);
        assert.equal(
            db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'manual_face_isolations'").get(),
            undefined,
        );
    } finally {
        db.close();
    }
});

test('legacy jobs rename applies only to the proven predecessor schema', async () => {
    const { applyLegacyMigrations } = await import('../../dist/core/src/data/legacyMigrationCompatibility.js');
    const db = new Database(':memory:');

    try {
        db.exec('CREATE TABLE jobs (id TEXT PRIMARY KEY, type TEXT NOT NULL)');
        applyLegacyMigrations(db, ['ALTER TABLE jobs RENAME COLUMN type TO stage']);
        const columns = db.prepare('PRAGMA table_info(jobs)').all().map((row) => row.name);
        assert.deepEqual(columns, ['id', 'stage']);
        applyLegacyMigrations(db, ['ALTER TABLE jobs RENAME COLUMN type TO stage']);
    } finally {
        db.close();
    }
});

test('legacy migration compatibility does not swallow unexpected schema failures', async () => {
    const { applyLegacyMigrations } = await import('../../dist/core/src/data/legacyMigrationCompatibility.js');
    const db = new Database(':memory:');

    try {
        assert.throws(
            () => applyLegacyMigrations(db, ['ALTER TABLE missing_table ADD COLUMN value TEXT']),
            /expected table 'missing_table' to exist/,
        );
        db.exec('CREATE TABLE jobs (id TEXT PRIMARY KEY)');
        assert.throws(
            () => applyLegacyMigrations(db, ['ALTER TABLE jobs RENAME COLUMN type TO stage']),
            /requires either a 'type' or 'stage' column/,
        );
        assert.throws(
            () => applyLegacyMigrations(db, ['DROP TABLE jobs']),
            /Unsupported legacy migration statement/,
        );
    } finally {
        db.close();
    }
});

test('failed numbered migration retries deterministically after close and reopen', async () => {
    const { applyNumberedMigrations } = await import('../../dist/core/src/data/migrationLedger.js');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp15-migration-retry-'));
    const dbPath = path.join(tempDir, 'migration.db');
    const completed = { id: 'wp15-001-completed', sql: 'CREATE TABLE completed_step (id TEXT PRIMARY KEY);' };
    const interrupted = {
        id: 'wp15-002-retry',
        sql: "CREATE TABLE interrupted_step (id TEXT PRIMARY KEY); INSERT INTO missing_table (id) VALUES ('fail');",
    };
    let db = new Database(dbPath);

    try {
        assert.throws(() => applyNumberedMigrations(db, [completed, interrupted]));
        db.close();

        db = new Database(dbPath);
        assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'completed_step'").get());
        assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'interrupted_step'").get(), undefined);
        assert.deepEqual(
            db.prepare('SELECT id FROM schema_migrations ORDER BY id').all(),
            [{ id: completed.id }],
        );

        const retry = { id: interrupted.id, sql: 'CREATE TABLE interrupted_step (id TEXT PRIMARY KEY);' };
        applyNumberedMigrations(db, [completed, retry]);
        applyNumberedMigrations(db, [completed, retry]);
        assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'interrupted_step'").get());
        assert.deepEqual(
            db.prepare('SELECT id FROM schema_migrations ORDER BY id').all(),
            [{ id: completed.id }, { id: interrupted.id }],
        );
    } finally {
        if (db.open) {
            db.close();
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
