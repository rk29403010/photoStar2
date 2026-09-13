import type { NumberedMigration } from './migrationLedger';

export const WP16_MIGRATIONS: readonly NumberedMigration[] = [
    {
        id: '20260913_002_exact_copy_presentation_hash_index',
        sql: 'CREATE INDEX IF NOT EXISTS idx_assets_file_hash ON assets(file_hash);',
    },
    {
        id: '20260913_003_exact_copy_presentation_cache',
        sql: `
            CREATE TABLE IF NOT EXISTS exact_copy_presentation_cache (
                presentation_key TEXT PRIMARY KEY,
                representative_asset_id TEXT NOT NULL,
                relationship_kind TEXT,
                stack_count INTEGER NOT NULL,
                file_hash TEXT,
                asset_ids_json TEXT NOT NULL,
                FOREIGN KEY (representative_asset_id) REFERENCES assets(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS exact_copy_presentation_cache_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                is_dirty INTEGER NOT NULL CHECK (is_dirty IN (0, 1))
            );

            INSERT OR IGNORE INTO exact_copy_presentation_cache_state (id, is_dirty)
            VALUES (1, 1);

            CREATE TRIGGER IF NOT EXISTS mark_exact_copy_presentation_cache_dirty_on_asset_insert
            AFTER INSERT ON assets
            BEGIN
                UPDATE exact_copy_presentation_cache_state SET is_dirty = 1 WHERE id = 1;
            END;

            CREATE TRIGGER IF NOT EXISTS mark_exact_copy_presentation_cache_dirty_on_asset_delete
            AFTER DELETE ON assets
            BEGIN
                UPDATE exact_copy_presentation_cache_state SET is_dirty = 1 WHERE id = 1;
            END;

            CREATE TRIGGER IF NOT EXISTS mark_exact_copy_presentation_cache_dirty_on_asset_update
            AFTER UPDATE OF file_hash, file_size, width, height, original_path, binned_at ON assets
            BEGIN
                UPDATE exact_copy_presentation_cache_state SET is_dirty = 1 WHERE id = 1;
            END;
        `,
    },
];
