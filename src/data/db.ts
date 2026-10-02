import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import {
  LEGACY_QUEUE_TABLE_NAME,
  LEGACY_WORKFLOW_SETTINGS,
  SCHEMA_SQL,
} from './dbSchema';
import { NUMBERED_MIGRATIONS } from './dbMigrations';
import { applyNumberedMigrations } from './migrationLedger';
import { applyLegacyMigrations } from './legacyMigrationCompatibility';
import {
  restoreDurableLibraryResetState,
  snapshotDurableLibraryResetState,
} from './durableLibraryResetState';
import {
  restoreDurableSemanticResetState,
  snapshotDurableSemanticResetState,
} from './semanticResetState';
import { WP11_MIGRATIONS } from './wp11Migrations';
import { WP12_MIGRATIONS } from './wp12Migrations';
import { WP13_MIGRATIONS } from './wp13Migrations';
import { WP15_MIGRATIONS } from './wp15Migrations';
import { WP16_MIGRATIONS } from './wp16Migrations';
import { WP9_CONTRACTION_MIGRATIONS } from './wp9ContractionMigrations';
import { snapshotSemanticPredicateDefinitions } from '../services/relationships/predicates/registry';


const INTERRUPTED_WORKFLOW_MESSAGE = 'Workflow execution was interrupted before this step finished. Retry the remaining work from the workflow view.';

function reconcileStaleWorkflowRuns(db: Database.Database): void {
    const now = new Date().toISOString();
    db.transaction(() => {
        db.prepare(`
            UPDATE analysis_generations
            SET status = 'failed', updated_at = ?, finished_at = COALESCE(finished_at, ?)
            WHERE status = 'running'
        `).run(now, now);

        db.prepare(`
            UPDATE step_runs
            SET status = 'failed',
                error_message = COALESCE(error_message, ?),
                updated_at = ?
            WHERE status = 'running'
        `).run(INTERRUPTED_WORKFLOW_MESSAGE, now);

        db.prepare(`
            UPDATE subject_executions
            SET status = 'failed',
                updated_at = ?
            WHERE status = 'running'
        `).run(now);

        db.prepare(`
            UPDATE workflow_runs
            SET status = 'failed',
                finished_at = COALESCE(finished_at, ?)
            WHERE status = 'running'
        `).run(now);
    })();
}



export class DatabaseManager {
  private db: Database.Database;
  private readonly dbPath: string;
  private diagnosticsDb: Database.Database | null = null;
  private readonly diagnosticsDbPath: string;
  private readonly softResetBackupPath: string;
  private readonly softResetReplacementPath: string;

  constructor(storagePath: string) {
    if (!existsSync(storagePath)) {
      mkdirSync(storagePath, { recursive: true });
    }
    this.dbPath = join(storagePath, 'library.db');
    this.diagnosticsDbPath = join(storagePath, 'ai_diagnostics.db');
    this.softResetBackupPath = join(storagePath, 'library.db.soft-reset-backup');
    this.softResetReplacementPath = join(storagePath, 'library.db.soft-reset-replacement');
    this.recoverInterruptedSoftReset();
    this.db = this.openDatabase();
    this.initSchema();
  }

  private removeDatabaseFiles(databasePath: string): void {
    for (const pathToDelete of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
      if (existsSync(pathToDelete)) {
        rmSync(pathToDelete, { force: true });
      }
    }
  }

  private recoverInterruptedSoftReset(): void {
    if (existsSync(this.softResetBackupPath)) {
      this.removeDatabaseFiles(this.dbPath);
      renameSync(this.softResetBackupPath, this.dbPath);
    }
    this.removeDatabaseFiles(this.softResetReplacementPath);
  }

  private openDatabaseAt(databasePath: string): Database.Database {
    const db = new Database(databasePath);
    db.pragma('journal_mode = WAL');
    return db;
  }

  private openDatabase(): Database.Database {
    return this.openDatabaseAt(this.dbPath);
  }

  private initDiagnosticsSchema(): void {
    if (this.diagnosticsDb) {
      return;
    }
    this.diagnosticsDb = new Database(this.diagnosticsDbPath);
    this.diagnosticsDb.pragma('journal_mode = WAL');
    this.diagnosticsDb.exec(`
      CREATE TABLE IF NOT EXISTS ai_calls_log (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        call_type TEXT NOT NULL,
        model_name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        result TEXT,
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ai_calls_log_asset_created ON ai_calls_log(asset_id, created_at DESC);
    `);
  }

  public getDiagnosticsDb(): Database.Database {
    if (!this.diagnosticsDb) {
      this.initDiagnosticsSchema();
    }
    return this.diagnosticsDb!;
  }

  private isClosedConnectionError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    return error.message.includes('database connection is not open');
  }

  private ensureOpenDatabase(): void {
    try {
      this.db.prepare('SELECT 1').get();
      return;
    } catch (error) {
      if (!this.isClosedConnectionError(error)) {
        throw error;
      }
    }

    this.db = this.openDatabase();
    this.initSchema();
  }

  private initSchema(db: Database.Database = this.db) {
    db.exec(SCHEMA_SQL);
    applyLegacyMigrations(db);
    applyNumberedMigrations(db, [
      ...NUMBERED_MIGRATIONS,
      ...WP9_CONTRACTION_MIGRATIONS,
      ...WP11_MIGRATIONS,
      ...WP12_MIGRATIONS,
      ...WP13_MIGRATIONS,
      ...WP15_MIGRATIONS,
      ...WP16_MIGRATIONS,
    ]);
    snapshotSemanticPredicateDefinitions(db);
    this.removeLegacyWorkflowState(db);
    reconcileStaleWorkflowRuns(db);

    // Jobs cannot resume after process restart; mark stale "running" rows as failed.
    db.prepare(
      "UPDATE jobs SET status = 'failed', finished_at = COALESCE(finished_at, ?) WHERE status = 'running'"
    ).run(new Date().toISOString());
    db.pragma('foreign_keys = ON');
  }

  private removeLegacyWorkflowState(db: Database.Database) {
    db.transaction(() => {
      db.exec(`DROP TABLE IF EXISTS ${LEGACY_QUEUE_TABLE_NAME}`);
      db.prepare(`
        DELETE FROM settings
        WHERE id IN (${LEGACY_WORKFLOW_SETTINGS.map(() => '?').join(', ')})
      `).run(...LEGACY_WORKFLOW_SETTINGS);
    })();
  }

  public getDb() {
    this.ensureOpenDatabase();
    return this.db;
  }

  private recreateFromSchema(): void {
    this.db.close();
    if (this.diagnosticsDb) {
      this.diagnosticsDb.close();
      this.diagnosticsDb = null;
    }
    this.removeDatabaseFiles(this.dbPath);
    this.removeDatabaseFiles(this.diagnosticsDbPath);

    this.db = this.openDatabase();
    this.initSchema();
  }

  private loadRows<RowType>(sql: string): RowType[] {
    return this.db.prepare(sql).all() as RowType[];
  }

  private snapshotSoftResetState() {
    return {
      assetIdentities: this.loadRows<{ guid: string; original_path: string; content_hash: string | null; content_size: number | null; last_known_path: string | null; created_at: string }>(
        'SELECT guid, original_path, content_hash, content_size, last_known_path, created_at FROM asset_identities ORDER BY created_at ASC, guid ASC'
      ),
      assetsManual: this.loadRows<{ identity_guid: string; sensitivity_status: string | null; updated_at: string }>(
        'SELECT identity_guid, sensitivity_status, updated_at FROM assets_manual ORDER BY identity_guid ASC'
      ),
      folderHistory: this.loadRows<{ path: string; last_scanned_at: string }>(
        'SELECT path, last_scanned_at FROM folder_history ORDER BY path ASC'
      ),
      settings: this.loadRows<{ id: string; value: string }>(
        'SELECT id, value FROM settings ORDER BY id ASC'
      ),
      semantic: snapshotDurableSemanticResetState(this.db),
      durableLibrary: snapshotDurableLibraryResetState(this.db),
    };
  }

  private restoreSoftResetState(
    db: Database.Database,
    snapshot: ReturnType<DatabaseManager['snapshotSoftResetState']>,
  ): void {
    const restore = db.transaction(() => {
      const insertAssetIdentity = db.prepare(`
        INSERT INTO asset_identities (guid, original_path, content_hash, content_size, last_known_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const row of snapshot.assetIdentities) {
        insertAssetIdentity.run(row.guid, row.original_path, row.content_hash, row.content_size, row.last_known_path, row.created_at);
      }

      const insertAssetManual = db.prepare(`
        INSERT INTO assets_manual (identity_guid, sensitivity_status, updated_at)
        VALUES (?, ?, ?)
      `);
      for (const row of snapshot.assetsManual) {
        insertAssetManual.run(row.identity_guid, row.sensitivity_status, row.updated_at);
      }

      const insertFolderHistory = db.prepare(`
        INSERT INTO folder_history (path, last_scanned_at)
        VALUES (?, ?)
      `);
      for (const row of snapshot.folderHistory) {
        insertFolderHistory.run(row.path, row.last_scanned_at);
      }

      const insertSetting = db.prepare(`
        INSERT OR REPLACE INTO settings (id, value)
        VALUES (?, ?)
      `);
      for (const row of snapshot.settings) {
        insertSetting.run(row.id, row.value);
      }

      restoreDurableSemanticResetState(db, snapshot.semantic);
      restoreDurableLibraryResetState(db, snapshot.durableLibrary);
    });

    restore();
  }

  private assertValidReplacement(db: Database.Database): void {
    const integrity = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
      throw new Error(`Soft reset replacement failed integrity_check: ${JSON.stringify(integrity)}`);
    }
    const foreignKeyErrors = db.pragma('foreign_key_check') as unknown[];
    if (foreignKeyErrors.length > 0) {
      throw new Error(`Soft reset replacement failed foreign_key_check: ${JSON.stringify(foreignKeyErrors)}`);
    }
  }

  private buildSoftResetReplacement(
    snapshot: ReturnType<DatabaseManager['snapshotSoftResetState']>,
  ): void {
    this.removeDatabaseFiles(this.softResetReplacementPath);
    const replacement = this.openDatabaseAt(this.softResetReplacementPath);
    let completed = false;
    try {
      this.initSchema(replacement);
      this.restoreSoftResetState(replacement, snapshot);
      this.assertValidReplacement(replacement);
      replacement.pragma('wal_checkpoint(TRUNCATE)');
      completed = true;
    } finally {
      replacement.close();
      if (!completed) {
        this.removeDatabaseFiles(this.softResetReplacementPath);
      }
    }
  }

  private restoreSoftResetBackup(): void {
    try {
      this.db.close();
    } catch {
      // The previous connection may already be closed at the swap boundary.
    }
    this.removeDatabaseFiles(this.dbPath);
    if (!existsSync(this.softResetBackupPath)) {
      throw new Error('Soft reset failed before a recoverable database backup was created.');
    }
    renameSync(this.softResetBackupPath, this.dbPath);
    this.db = this.openDatabase();
    this.db.pragma('foreign_keys = ON');
  }

  private installSoftResetReplacement(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
    try {
      renameSync(this.dbPath, this.softResetBackupPath);
      renameSync(this.softResetReplacementPath, this.dbPath);
      this.db = this.openDatabase();
      this.db.pragma('foreign_keys = ON');
      this.assertValidReplacement(this.db);
      rmSync(this.softResetBackupPath, { force: true });
    } catch (error) {
      if (existsSync(this.softResetBackupPath)) {
        this.restoreSoftResetBackup();
      } else {
        this.db = this.openDatabase();
        this.db.pragma('foreign_keys = ON');
      }
      throw error;
    } finally {
      this.removeDatabaseFiles(this.softResetReplacementPath);
    }
  }

  public resetToFactorySchema(): void {
    // Factory reset must always delete the DB files and rebuild from schema.
    this.recreateFromSchema();
  }

  public resetPreservingManualData(): void {
    const snapshot = this.snapshotSoftResetState();
    this.buildSoftResetReplacement(snapshot);
    this.installSoftResetReplacement();
  }

  public close(): void {
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
       
    }
    this.db.close();

    if (this.diagnosticsDb) {
      try {
        this.diagnosticsDb.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
         
      }
      this.diagnosticsDb.close();
    }
  }

  public getSetting(key: string): string {
    const row = this.db.prepare('SELECT value FROM settings WHERE id = ?').get(key) as { value: string } | undefined;
    return row?.value || '';
  }

  public setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (id, value) VALUES (?, ?)').run(key, value);
  }
}
