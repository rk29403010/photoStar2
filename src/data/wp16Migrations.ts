import type { NumberedMigration } from './migrationLedger';

export const WP16_MIGRATIONS: readonly NumberedMigration[] = [
    {
        id: '20260913_002_exact_copy_presentation_hash_index',
        sql: 'CREATE INDEX IF NOT EXISTS idx_assets_file_hash ON assets(file_hash);',
    },
];
