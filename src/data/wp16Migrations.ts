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
    {
        id: '20260913_004_exact_copy_presentation_cache_order',
        sql: `
            ALTER TABLE exact_copy_presentation_cache ADD COLUMN photo_created_at TEXT;
            ALTER TABLE exact_copy_presentation_cache ADD COLUMN created_at TEXT;
            UPDATE exact_copy_presentation_cache
            SET created_at = COALESCE(created_at, '');
            CREATE INDEX IF NOT EXISTS idx_exact_copy_presentation_cache_default_order
                ON exact_copy_presentation_cache(photo_created_at DESC, created_at DESC, representative_asset_id);
            DROP TRIGGER IF EXISTS mark_exact_copy_presentation_cache_dirty_on_asset_update;
            CREATE TRIGGER mark_exact_copy_presentation_cache_dirty_on_asset_update
            AFTER UPDATE OF file_hash, file_size, width, height, original_path, photo_created_at, created_at, binned_at ON assets
            BEGIN
                UPDATE exact_copy_presentation_cache_state SET is_dirty = 1 WHERE id = 1;
            END;
        `,
    },
    {
        id: '20260913_005_capture_sequence_presentation_cache',
        sql: `
            CREATE TABLE IF NOT EXISTS capture_sequence_presentation_cache (
                presentation_order TEXT NOT NULL,
                ordinal INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                PRIMARY KEY (presentation_order, ordinal)
            );
            CREATE TABLE IF NOT EXISTS capture_sequence_presentation_cache_state (
                id TEXT PRIMARY KEY,
                is_dirty INTEGER NOT NULL CHECK (is_dirty IN (0, 1))
            );
            INSERT OR IGNORE INTO capture_sequence_presentation_cache_state (id, is_dirty)
            VALUES ('default', 1), ('oldest_first', 1), ('previewed_first', 1);
            CREATE TRIGGER IF NOT EXISTS mark_capture_sequence_presentation_cache_dirty_on_asset_change
            AFTER INSERT ON assets BEGIN UPDATE capture_sequence_presentation_cache_state SET is_dirty = 1; END;
            CREATE TRIGGER IF NOT EXISTS mark_capture_sequence_presentation_cache_dirty_on_asset_update
            AFTER UPDATE ON assets BEGIN UPDATE capture_sequence_presentation_cache_state SET is_dirty = 1; END;
            CREATE TRIGGER IF NOT EXISTS mark_capture_sequence_presentation_cache_dirty_on_asset_delete
            AFTER DELETE ON assets BEGIN UPDATE capture_sequence_presentation_cache_state SET is_dirty = 1; END;
            CREATE TRIGGER IF NOT EXISTS mark_capture_sequence_presentation_cache_dirty_on_sequence_change
            AFTER INSERT ON capture_sequences BEGIN UPDATE capture_sequence_presentation_cache_state SET is_dirty = 1; END;
            CREATE TRIGGER IF NOT EXISTS mark_capture_sequence_presentation_cache_dirty_on_sequence_update
            AFTER UPDATE ON capture_sequences BEGIN UPDATE capture_sequence_presentation_cache_state SET is_dirty = 1; END;
            CREATE TRIGGER IF NOT EXISTS mark_capture_sequence_presentation_cache_dirty_on_member_change
            AFTER INSERT ON capture_sequence_members BEGIN UPDATE capture_sequence_presentation_cache_state SET is_dirty = 1; END;
            CREATE TRIGGER IF NOT EXISTS mark_capture_sequence_presentation_cache_dirty_on_member_update
            AFTER UPDATE ON capture_sequence_members BEGIN UPDATE capture_sequence_presentation_cache_state SET is_dirty = 1; END;
            CREATE TRIGGER IF NOT EXISTS mark_capture_sequence_presentation_cache_dirty_on_member_delete
            AFTER DELETE ON capture_sequence_members BEGIN UPDATE capture_sequence_presentation_cache_state SET is_dirty = 1; END;
        `,
    },
];
