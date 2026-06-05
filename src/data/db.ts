import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import {
  LEGACY_QUEUE_TABLE_NAME,
  LEGACY_WORKFLOW_SETTINGS,
  MIGRATIONS,
  SCHEMA_SQL,
} from './dbSchema';


function runMigration(db: Database.Database, sql: string): void {
  try {
    db.prepare(sql).run();
  } catch {
     
  }
}

const INTERRUPTED_WORKFLOW_MESSAGE = 'Workflow execution was interrupted before this step finished. Retry the remaining work from the workflow view.';

function reconcileStaleWorkflowRuns(db: Database.Database): void {
    const now = new Date().toISOString();

    try {
        db.transaction(() => {
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
    } catch {
         
    }
}



export class DatabaseManager {
  private db: Database.Database;
  private readonly dbPath: string;
  private diagnosticsDb: Database.Database | null = null;
  private readonly diagnosticsDbPath: string;

  constructor(storagePath: string) {
    if (!existsSync(storagePath)) {
      mkdirSync(storagePath, { recursive: true });
    }
    this.dbPath = join(storagePath, 'library.db');
    this.diagnosticsDbPath = join(storagePath, 'ai_diagnostics.db');
    this.db = this.openDatabase();
    this.initSchema();
  }

  private openDatabase(): Database.Database {
    const db = new Database(this.dbPath);
    db.pragma('journal_mode = WAL');
    return db;
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

  private initSchema() {
    this.db.exec(SCHEMA_SQL);
    for (const migration of MIGRATIONS) {runMigration(this.db, migration);}
    this.removeLegacyWorkflowState();
    reconcileStaleWorkflowRuns(this.db);

    // Jobs cannot resume after process restart; mark stale "running" rows as failed.
    try {
      this.db.prepare(
        "UPDATE jobs SET status = 'failed', finished_at = COALESCE(finished_at, ?) WHERE status = 'running'"
      ).run(new Date().toISOString());
    } catch {
       
    }
  }

  private removeLegacyWorkflowState() {
    try {
      this.db.transaction(() => {
        this.db.exec(`DROP TABLE IF EXISTS ${LEGACY_QUEUE_TABLE_NAME}`);
        this.db.prepare(`
          DELETE FROM settings
          WHERE id IN (${LEGACY_WORKFLOW_SETTINGS.map(() => '?').join(', ')})
        `).run(...LEGACY_WORKFLOW_SETTINGS);
      })();
    } catch {
       
    }
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
    for (const pathToDelete of [
      this.dbPath, `${this.dbPath}-wal`, `${this.dbPath}-shm`,
      this.diagnosticsDbPath, `${this.diagnosticsDbPath}-wal`, `${this.diagnosticsDbPath}-shm`
    ]) {
      if (!existsSync(pathToDelete)) {
        continue;
      }
      rmSync(pathToDelete, { force: true });
    }

    this.db = this.openDatabase();
    this.initSchema();
  }

  private loadRows<RowType>(sql: string): RowType[] {
    return this.db.prepare(sql).all() as RowType[];
  }

  private snapshotSoftResetState() {
    return {
      assetIdentities: this.loadRows<{ guid: string; original_path: string; created_at: string }>(
        'SELECT guid, original_path, created_at FROM asset_identities ORDER BY created_at ASC, guid ASC'
      ),
      assetsManual: this.loadRows<{ identity_guid: string; sensitivity_status: string | null; updated_at: string }>(
        'SELECT identity_guid, sensitivity_status, updated_at FROM assets_manual ORDER BY identity_guid ASC'
      ),
      manualFaceNames: this.loadRows<{ original_path: string; face_index: number; name: string; created_at: string }>(
        'SELECT original_path, face_index, name, created_at FROM manual_face_names ORDER BY original_path ASC, face_index ASC'
      ),
      manualFaceIsolations: this.loadRows<{ original_path: string; face_index: number; from_person_id: string | null; created_at: string }>(
        'SELECT original_path, face_index, from_person_id, created_at FROM manual_face_isolations ORDER BY original_path ASC, face_index ASC'
      ),
      folderHistory: this.loadRows<{ path: string; last_scanned_at: string }>(
        'SELECT path, last_scanned_at FROM folder_history ORDER BY path ASC'
      ),
      settings: this.loadRows<{ id: string; value: string }>(
        'SELECT id, value FROM settings ORDER BY id ASC'
      ),
    };
  }

  private restoreSoftResetState(snapshot: ReturnType<DatabaseManager['snapshotSoftResetState']>): void {
    const restore = this.db.transaction(() => {
      const insertAssetIdentity = this.db.prepare(`
        INSERT INTO asset_identities (guid, original_path, created_at)
        VALUES (?, ?, ?)
      `);
      for (const row of snapshot.assetIdentities) {
        insertAssetIdentity.run(row.guid, row.original_path, row.created_at);
      }

      const insertAssetManual = this.db.prepare(`
        INSERT INTO assets_manual (identity_guid, sensitivity_status, updated_at)
        VALUES (?, ?, ?)
      `);
      for (const row of snapshot.assetsManual) {
        insertAssetManual.run(row.identity_guid, row.sensitivity_status, row.updated_at);
      }

      const insertManualFaceName = this.db.prepare(`
        INSERT INTO manual_face_names (original_path, face_index, name, created_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const row of snapshot.manualFaceNames) {
        insertManualFaceName.run(row.original_path, row.face_index, row.name, row.created_at);
      }

      const insertManualFaceIsolation = this.db.prepare(`
        INSERT INTO manual_face_isolations (original_path, face_index, from_person_id, created_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const row of snapshot.manualFaceIsolations) {
        insertManualFaceIsolation.run(row.original_path, row.face_index, row.from_person_id, row.created_at);
      }

      const insertFolderHistory = this.db.prepare(`
        INSERT INTO folder_history (path, last_scanned_at)
        VALUES (?, ?)
      `);
      for (const row of snapshot.folderHistory) {
        insertFolderHistory.run(row.path, row.last_scanned_at);
      }

      const insertSetting = this.db.prepare(`
        INSERT OR REPLACE INTO settings (id, value)
        VALUES (?, ?)
      `);
      for (const row of snapshot.settings) {
        insertSetting.run(row.id, row.value);
      }
    });

    restore();
  }

  public resetToFactorySchema(): void {
    // Factory reset must always delete the DB files and rebuild from schema.
    this.recreateFromSchema();
  }

  public resetPreservingManualData(): void {
    const snapshot = this.snapshotSoftResetState();
    this.recreateFromSchema();
    this.restoreSoftResetState(snapshot);
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
