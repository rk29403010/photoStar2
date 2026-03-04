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
        sensitivity_score INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Permanent identity map (survives factory reset)
      CREATE TABLE IF NOT EXISTS asset_identities (
        guid TEXT PRIMARY KEY,
        original_path TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Generic manual shadow table (survives factory reset)
      -- sensitivity_status: 'safe' | 'review' | 'unsafe' | NULL (use AI score)
      CREATE TABLE IF NOT EXISTS assets_manual (
        identity_guid TEXT PRIMARY KEY,
        sensitivity_status TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(identity_guid) REFERENCES asset_identities(guid)
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

      CREATE TABLE IF NOT EXISTS manual_face_names (
        original_path TEXT NOT NULL,
        face_index INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (original_path, face_index)
      );

      CREATE TABLE IF NOT EXISTS manual_face_isolations (
        original_path TEXT NOT NULL,
        face_index INTEGER NOT NULL,
        from_person_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (original_path, face_index)
      );

      CREATE TABLE IF NOT EXISTS task_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id TEXT NOT NULL,
        pipeline_stage TEXT NOT NULL,
        status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
        priority INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(media_id, pipeline_stage),
        FOREIGN KEY(media_id) REFERENCES assets(id)
      );

      CREATE INDEX IF NOT EXISTS idx_assets_path ON assets(original_path);
      CREATE INDEX IF NOT EXISTS idx_derived_task ON derived_results(task);
      CREATE INDEX IF NOT EXISTS idx_assignments_person ON face_assignments(person_id);
      CREATE INDEX IF NOT EXISTS idx_issues_asset ON processing_issues(asset_id);
      CREATE INDEX IF NOT EXISTS idx_task_queue_status_priority ON task_queue(status, priority DESC);
      CREATE INDEX IF NOT EXISTS idx_identities_path ON asset_identities(original_path);

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Migrations for existing tables
    try { this.db.prepare("ALTER TABLE assets ADD COLUMN width INTEGER").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE assets ADD COLUMN height INTEGER").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE assets ADD COLUMN caption TEXT").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE assets ADD COLUMN sensitivity_score INTEGER").run(); } catch (e) { }

    // manual_face_isolations migration: track which person a face was removed from
    try { this.db.prepare("ALTER TABLE manual_face_isolations ADD COLUMN from_person_id TEXT").run(); } catch (e) { }

    // Jobs migrations
    try { this.db.prepare("ALTER TABLE jobs RENAME COLUMN type TO stage").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN started_at TEXT").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN finished_at TEXT").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN total_items INTEGER DEFAULT 0").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN processed_items INTEGER DEFAULT 0").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN error_count INTEGER DEFAULT 0").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN current_item_path TEXT").run(); } catch (e) { }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN throughput_ips REAL DEFAULT 0").run(); } catch (e) { }

    // Resume uncompleted tasks on application restart
    try {
      this.db.prepare("UPDATE task_queue SET status = 'pending' WHERE status = 'processing'").run();
    } catch (e) {
      // table might not exist on extremely weird edge cases before commit, ignore
    }
  }

  public getDb() {
    return this.db;
  }
}
