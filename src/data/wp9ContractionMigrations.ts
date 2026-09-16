import type { NumberedMigration } from './migrationLedger';

/**
 * Final WP9 contraction migrations.
 *
 * Keep this separate from the already-applied semantic migration list so the
 * checksummed history remains byte-for-byte untouched while existing development
 * databases receive a new migration after the temporary compatibility tables
 * were recreated.
 */
export const WP9_CONTRACTION_MIGRATIONS: readonly NumberedMigration[] = [
    {
        id: '20260908_001_contract_legacy_asset_groups',
        sql: `
            DROP TABLE IF EXISTS asset_group_children;
            DROP TABLE IF EXISTS asset_group_members;
            DROP TABLE IF EXISTS asset_groups;
        `,
    },
];
