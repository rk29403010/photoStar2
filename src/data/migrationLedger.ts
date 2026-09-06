import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

export type NumberedMigration = {
    id: string;
    sql: string;
};

type AppliedMigrationRow = {
    id: string;
    checksum: string;
};

const MIGRATION_LEDGER_SQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`;

export function calculateMigrationChecksum(migration: Pick<NumberedMigration, 'id' | 'sql'>): string {
    return createHash('sha256')
        .update(migration.id)
        .update('\n')
        .update(migration.sql)
        .digest('hex');
}

function assertUniqueMigrationIds(migrations: readonly NumberedMigration[]): void {
    const seenIds = new Set<string>();
    for (const migration of migrations) {
        if (seenIds.has(migration.id)) {
            throw new Error(`Duplicate schema migration id '${migration.id}'.`);
        }
        seenIds.add(migration.id);
    }
}

export function applyNumberedMigrations(
    db: Database.Database,
    migrations: readonly NumberedMigration[],
): void {
    assertUniqueMigrationIds(migrations);
    db.exec(MIGRATION_LEDGER_SQL);

    const readApplied = db.prepare('SELECT id, checksum FROM schema_migrations WHERE id = ?');
    const recordApplied = db.prepare(`
        INSERT INTO schema_migrations (id, checksum)
        VALUES (?, ?)
    `);

    for (const migration of migrations) {
        const checksum = calculateMigrationChecksum(migration);
        const applied = readApplied.get(migration.id) as AppliedMigrationRow | undefined;

        if (applied) {
            if (applied.checksum !== checksum) {
                throw new Error(
                    `Schema migration '${migration.id}' changed after it was applied. `
                    + `Expected checksum ${applied.checksum}, received ${checksum}.`,
                );
            }
            continue;
        }

        db.transaction(() => {
            db.exec(migration.sql);
            recordApplied.run(migration.id, checksum);
        })();
    }
}
