import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

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
      CREATE INDEX IF NOT EXISTS idx_issues_task ON processing_issues(task);
      CREATE INDEX IF NOT EXISTS idx_task_queue_status_priority ON task_queue(status, priority DESC);
      CREATE INDEX IF NOT EXISTS idx_identities_path ON asset_identities(original_path);

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        value TEXT
      );

      -- GROUPING TABLES
      CREATE TABLE IF NOT EXISTS asset_groups (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,                 -- 'duplicate' | 'near_duplicate' | 'variant_set' | 'burst' | 'people'
        status TEXT NOT NULL,               -- 'proposed' | 'confirmed' | 'rejected' | 'locked'
        title TEXT,
        description TEXT,
        canonical_asset_id TEXT,            
        algorithm_version TEXT,             
        params_json TEXT,                   
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (canonical_asset_id) REFERENCES assets(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS asset_group_members (
        group_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        role TEXT NOT NULL,                 -- 'member' | 'canonical' | 'preferred' | 'excluded'
        rank INTEGER,                       
        evidence_json TEXT,                 
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, asset_id),
        FOREIGN KEY (group_id) REFERENCES asset_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS asset_similarity_edges (
        asset_id_a TEXT NOT NULL,
        asset_id_b TEXT NOT NULL,
        kind TEXT NOT NULL,                 -- 'visual' | 'face' | 'time' | 'metadata' | 'ocr' | 'hybrid'
        score REAL NOT NULL,                
        reason TEXT,                        
        evidence_json TEXT,                 
        algorithm_version TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (asset_id_a, asset_id_b, kind),
        FOREIGN KEY (asset_id_a) REFERENCES assets(id) ON DELETE CASCADE,
        FOREIGN KEY (asset_id_b) REFERENCES assets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS asset_features (
        asset_id TEXT PRIMARY KEY,
        file_hash TEXT,                     
        phash64 TEXT,                       
        dhash64 TEXT,                       
        ahash64 TEXT,                       
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );

      -- ALBUM TABLES
      CREATE TABLE IF NOT EXISTS albums (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        cover_asset_id TEXT,
        rules_json TEXT,                    -- If set, this is a smart/rule-based album
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cover_asset_id) REFERENCES assets(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS album_items (
        album_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        added_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (album_id, asset_id),
        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_asset_groups_type ON asset_groups(type);
      CREATE INDEX IF NOT EXISTS idx_asset_groups_canonical ON asset_groups(canonical_asset_id);
      CREATE INDEX IF NOT EXISTS idx_group_members_asset ON asset_group_members(asset_id);
      CREATE INDEX IF NOT EXISTS idx_group_members_group ON asset_group_members(group_id);
      CREATE INDEX IF NOT EXISTS idx_edges_a ON asset_similarity_edges(asset_id_a);
      CREATE INDEX IF NOT EXISTS idx_edges_b ON asset_similarity_edges(asset_id_b);
      CREATE INDEX IF NOT EXISTS idx_edges_kind_score ON asset_similarity_edges(kind, score);
      CREATE INDEX IF NOT EXISTS idx_asset_features_phash ON asset_features(phash64);
      CREATE INDEX IF NOT EXISTS idx_album_items_asset ON album_items(asset_id);
    `);

    // Migrations for existing tables
    try { this.db.prepare("ALTER TABLE assets ADD COLUMN width INTEGER").run(); } catch { /* ignore */ }
    try { this.db.prepare("ALTER TABLE assets ADD COLUMN height INTEGER").run(); } catch { /* ignore */ }
    try { this.db.prepare("ALTER TABLE assets ADD COLUMN caption TEXT").run(); } catch { /* ignore */ }
    try { this.db.prepare("ALTER TABLE assets ADD COLUMN sensitivity_score INTEGER").run(); } catch { /* ignore */ }

    // manual_face_isolations migration: track which person a face was removed from
    try { this.db.prepare("ALTER TABLE manual_face_isolations ADD COLUMN from_person_id TEXT").run(); } catch { /* ignore */ }

    // Jobs migrations
    try { this.db.prepare("ALTER TABLE jobs RENAME COLUMN type TO stage").run(); } catch { /* ignore */ }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN started_at TEXT").run(); } catch { /* ignore */ }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN finished_at TEXT").run(); } catch { /* ignore */ }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN total_items INTEGER DEFAULT 0").run(); } catch { /* ignore */ }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN processed_items INTEGER DEFAULT 0").run(); } catch { /* ignore */ }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN error_count INTEGER DEFAULT 0").run(); } catch { /* ignore */ }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN current_item_path TEXT").run(); } catch { /* ignore */ }
    try { this.db.prepare("ALTER TABLE jobs ADD COLUMN throughput_ips REAL DEFAULT 0").run(); } catch { /* ignore */ }

    // Resume uncompleted tasks on application restart
    try {
      this.db.prepare("UPDATE task_queue SET status = 'pending' WHERE status = 'processing'").run();
    } catch {
      // table might not exist on extremely weird edge cases before commit, ignore
    }
  }

  public getDb() {
    return this.db;
  }

  public getSetting(key: string): string {
    const row = this.db.prepare('SELECT value FROM settings WHERE id = ?').get(key) as { value: string } | undefined;
    return row?.value || '';
  }

  public setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (id, value) VALUES (?, ?)').run(key, value);
  }
}
