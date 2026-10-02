import type { NumberedMigration } from './migrationLedger';

export const WP15_MIGRATIONS: readonly NumberedMigration[] = [
    {
        id: '20260913_001_asset_identity_fingerprint_binding',
        sql: `
            ALTER TABLE asset_identities ADD COLUMN content_hash TEXT;
            ALTER TABLE asset_identities ADD COLUMN content_size INTEGER;
            ALTER TABLE asset_identities ADD COLUMN last_known_path TEXT;
            ALTER TABLE assets ADD COLUMN asset_identity_guid TEXT REFERENCES asset_identities(guid);

            UPDATE asset_identities
            SET last_known_path = original_path
            WHERE last_known_path IS NULL;

            UPDATE assets
            SET asset_identity_guid = (
                SELECT identity.guid
                FROM asset_identities identity
                WHERE identity.original_path = assets.original_path
            )
            WHERE asset_identity_guid IS NULL
              AND EXISTS (
                SELECT 1 FROM asset_identities identity
                WHERE identity.original_path = assets.original_path
            );

            UPDATE asset_identities
            SET content_hash = (
                    SELECT asset.file_hash FROM assets asset
                    WHERE asset.asset_identity_guid = asset_identities.guid
                      AND asset.file_hash IS NOT NULL
                    ORDER BY asset.created_at DESC, asset.id DESC LIMIT 1
                ),
                content_size = (
                    SELECT asset.file_size FROM assets asset
                    WHERE asset.asset_identity_guid = asset_identities.guid
                      AND asset.file_hash IS NOT NULL
                    ORDER BY asset.created_at DESC, asset.id DESC LIMIT 1
                )
            WHERE content_hash IS NULL;

            CREATE INDEX idx_assets_identity_guid ON assets(asset_identity_guid);
            CREATE INDEX idx_asset_identities_fingerprint
                ON asset_identities(content_hash, content_size);
        `,
    },
];
