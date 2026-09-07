import type Database from 'better-sqlite3';

/**
 * Temporary WP9 compatibility schema.
 *
 * The semantic relationship runtime is already authoritative for new presentation
 * behaviour, but a small set of parity tests and transitional consumers still
 * require the legacy group tables. Keep these tables available until those final
 * readers/writers are removed, then delete this bootstrap and contract the schema
 * with a new numbered migration.
 */
export function ensureLegacyGroupCompatibilityTables(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS asset_groups (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
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
            role TEXT NOT NULL,
            rank INTEGER,
            evidence_json TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (group_id, asset_id),
            FOREIGN KEY (group_id) REFERENCES asset_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS asset_group_children (
            parent_group_id TEXT NOT NULL,
            child_group_id TEXT NOT NULL,
            rank INTEGER,
            evidence_json TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (parent_group_id, child_group_id),
            FOREIGN KEY (parent_group_id) REFERENCES asset_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (child_group_id) REFERENCES asset_groups(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_asset_groups_type ON asset_groups(type);
        CREATE INDEX IF NOT EXISTS idx_asset_groups_canonical ON asset_groups(canonical_asset_id);
        CREATE INDEX IF NOT EXISTS idx_group_members_asset ON asset_group_members(asset_id);
        CREATE INDEX IF NOT EXISTS idx_group_members_group ON asset_group_members(group_id);
        CREATE INDEX IF NOT EXISTS idx_group_children_parent ON asset_group_children(parent_group_id);
        CREATE INDEX IF NOT EXISTS idx_group_children_child ON asset_group_children(child_group_id);
    `);
}
