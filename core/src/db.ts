import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

export class DatabaseManager {
  private db: Database.Database;

  constructor(storagePath: string) {
    if (!existsSync(storagePath)) {
      mkdirSync(storagePath, { recursive: true });
    }
    const dbPath = join(storagePath, 'library.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        original_path TEXT NOT NULL,
        file_hash TEXT,
        file_size INTEGER,
        width INTEGER,
        height INTEGER,
        exif_datetime TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );


      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        cancelable INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        finished_at TEXT,
        total_items INTEGER DEFAULT 0,
        processed_items INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        current_item_path TEXT,
        throughput_ips REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS previews (
        asset_id TEXT NOT NULL,
        size TEXT NOT NULL,
        path TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (asset_id, size),
        FOREIGN KEY(asset_id) REFERENCES assets(id)
      );

      CREATE TABLE IF NOT EXISTS derived_results (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        task TEXT NOT NULL,
        provider TEXT NOT NULL,
        model_version TEXT,
        data JSON,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(asset_id) REFERENCES assets(id)
      );
      
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        name TEXT,
        thumbnail_path TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS face_assignments (
        asset_id TEXT NOT NULL,
        face_index INTEGER NOT NULL,
        person_id TEXT NOT NULL,
        confidence REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (asset_id, face_index),
        FOREIGN KEY(asset_id) REFERENCES assets(id),
        FOREIGN KEY(person_id) REFERENCES people(id)
      );

      CREATE TABLE IF NOT EXISTS folder_history (
        path TEXT PRIMARY KEY,
        last_scanned_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS processing_issues (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        job_id TEXT,
        task TEXT NOT NULL, -- 'preview', 'detection', 'recognition'
        severity TEXT NOT NULL, -- 'warning', 'fatal'
        message TEXT,
        details TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(asset_id) REFERENCES assets(id)
      );

      CREATE INDEX IF NOT EXISTS idx_assets_path ON assets(original_path);
      CREATE INDEX IF NOT EXISTS idx_derived_task ON derived_results(task);
      CREATE INDEX IF NOT EXISTS idx_assignments_person ON face_assignments(person_id);
      CREATE INDEX IF NOT EXISTS idx_issues_asset ON processing_issues(asset_id);
    `);

    // Migrations for existing tables
    try { this.db.prepare("ALTER TABLE assets ADD COLUMN width INTEGER").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE assets ADD COLUMN height INTEGER").run(); } catch (e) { }

    // Jobs migrations
    try { this.db.prepare("ALTER TABLE jobs RENAME COLUMN type TO stage").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN started_at TEXT").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN finished_at TEXT").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN total_items INTEGER DEFAULT 0").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN processed_items INTEGER DEFAULT 0").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN error_count INTEGER DEFAULT 0").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN current_item_path TEXT").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN throughput_ips REAL DEFAULT 0").run(); } catch (e) { }
  }

  public getDb() {
    return this.db;
  }
}
