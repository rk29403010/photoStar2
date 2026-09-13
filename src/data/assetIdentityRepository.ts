import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from './db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type AssetIdentity = { guid: string; originalPath: string };

type AssetRow = {
    id: string;
    original_path: string;
    file_hash: string | null;
    file_size: number | null;
    asset_identity_guid: string | null;
};

type IdentityRow = AssetIdentity & {
    content_hash: string | null;
    content_size: number | null;
};

function loadAsset(db: DbHandle, assetId: string): AssetRow {
    const asset = db.prepare(`
        SELECT id, original_path, file_hash, file_size, asset_identity_guid
        FROM assets WHERE id = ?
    `).get(assetId) as AssetRow | undefined;
    if (!asset) {
        throw new Error(`Unknown asset '${assetId}'.`);
    }
    return asset;
}

function fingerprintMatches(asset: AssetRow, identity: IdentityRow): boolean {
    return asset.file_hash !== null
        && asset.file_size !== null
        && identity.content_hash === asset.file_hash
        && identity.content_size === asset.file_size;
}

function bindAsset(db: DbHandle, assetId: string, identity: AssetIdentity): AssetIdentity {
    db.prepare('UPDATE assets SET asset_identity_guid = ? WHERE id = ?').run(identity.guid, assetId);
    return identity;
}

function createIdentity(db: DbHandle, asset: AssetRow): AssetIdentity {
    const identity = { guid: uuidv4(), originalPath: asset.original_path };
    db.prepare(`
        INSERT INTO asset_identities (
            guid, original_path, content_hash, content_size, last_known_path
        ) VALUES (?, ?, ?, ?, ?)
    `).run(identity.guid, identity.originalPath, asset.file_hash, asset.file_size, asset.original_path);
    return identity;
}

/**
 * Establishes a durable asset identity without treating a pathname as proof of
 * sameness. A path match is reusable only with an exact content fingerprint;
 * a moved file can reattach only to one detached fingerprint match.
 */
export function ensureAssetIdentityForAsset(db: DbHandle, assetId: string): AssetIdentity {
    const asset = loadAsset(db, assetId);
    if (asset.asset_identity_guid) {
        const bound = db.prepare(`
            SELECT guid, original_path AS originalPath
            FROM asset_identities WHERE guid = ?
        `).get(asset.asset_identity_guid) as AssetIdentity | undefined;
        if (bound) {
            return bound;
        }
        throw new Error(`Asset '${assetId}' references a missing durable identity.`);
    }

    const byPath = db.prepare(`
        SELECT guid, original_path AS originalPath, content_hash, content_size
        FROM asset_identities WHERE original_path = ?
    `).get(asset.original_path) as IdentityRow | undefined;
    if (byPath && fingerprintMatches(asset, byPath)) {
        return bindAsset(db, asset.id, byPath);
    }

    if (byPath) {
        // Keep the old identity and its history, but free the live path for the
        // replacement. References remain attached to this detached identity.
        db.prepare(`
            UPDATE asset_identities
            SET last_known_path = ?, original_path = ?
            WHERE guid = ?
        `).run(byPath.originalPath, `detached:${byPath.guid}`, byPath.guid);
        return bindAsset(db, asset.id, createIdentity(db, asset));
    }

    if (asset.file_hash !== null && asset.file_size !== null) {
        const matches = db.prepare(`
            SELECT identity.guid, identity.original_path AS originalPath,
                   identity.content_hash, identity.content_size
            FROM asset_identities identity
            LEFT JOIN assets bound_asset ON bound_asset.asset_identity_guid = identity.guid
            WHERE identity.content_hash = ?
              AND identity.content_size = ?
              AND bound_asset.id IS NULL
            ORDER BY identity.guid
        `).all(asset.file_hash, asset.file_size) as IdentityRow[];
        if (matches.length === 1) {
            const match = matches[0];
            db.prepare(`
                UPDATE asset_identities
                SET original_path = ?, last_known_path = ?
                WHERE guid = ?
            `).run(asset.original_path, asset.original_path, match.guid);
            return bindAsset(db, asset.id, { guid: match.guid, originalPath: asset.original_path });
        }
    }

    return bindAsset(db, asset.id, createIdentity(db, asset));
}
