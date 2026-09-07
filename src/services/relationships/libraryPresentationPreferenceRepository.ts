import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { LibraryPresentationItem } from '../../boundary/contracts/libraryPresentation';
import type { DatabaseManager } from '../../data/db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type PreferenceRow = {
    cluster_fingerprint: string;
    preferred_asset_identity_guid: string | null;
    show_separately: number;
};

type AssetIdentityRow = {
    asset_id: string;
    original_path: string;
    identity_guid: string | null;
};

function loadAssetIdentityRows(db: DbHandle, assetIds: readonly string[]): AssetIdentityRow[] {
    if (assetIds.length === 0) {
        return [];
    }
    const placeholders = assetIds.map(() => '?').join(', ');
    return db.prepare(`
        SELECT
            asset.id AS asset_id,
            asset.original_path,
            identity.guid AS identity_guid
        FROM assets asset
        LEFT JOIN asset_identities identity ON identity.original_path = asset.original_path
        WHERE asset.id IN (${placeholders})
    `).all(...assetIds) as AssetIdentityRow[];
}

function ensureAssetIdentityGuids(db: DbHandle, assetIds: readonly string[]): Map<string, string> {
    const rows = loadAssetIdentityRows(db, assetIds);
    if (rows.length !== assetIds.length) {
        throw new Error('Cannot persist a presentation preference for missing assets.');
    }
    const insert = db.prepare(`
        INSERT INTO asset_identities (guid, original_path)
        VALUES (?, ?)
    `);
    const byAssetId = new Map<string, string>();
    for (const row of rows) {
        const guid = row.identity_guid ?? uuidv4();
        if (!row.identity_guid) {
            insert.run(guid, row.original_path);
        }
        byAssetId.set(row.asset_id, guid);
    }
    return byAssetId;
}

function loadExistingAssetIdentityGuids(
    db: DbHandle,
    assetIds: readonly string[],
): Map<string, string> | null {
    const rows = loadAssetIdentityRows(db, assetIds);
    if (rows.length !== assetIds.length || rows.some((row) => !row.identity_guid)) {
        return null;
    }
    return new Map(rows.map((row) => [row.asset_id, row.identity_guid! as string]));
}

function fingerprintFromIdentityGuids(identityGuids: Iterable<string>): string {
    const canonicalMembers = [...identityGuids].sort((left, right) => left.localeCompare(right));
    const digest = createHash('sha256').update(canonicalMembers.join('\n')).digest('hex');
    return `members:${digest}`;
}

function getFingerprintForRead(db: DbHandle, item: LibraryPresentationItem): string | null {
    const identities = loadExistingAssetIdentityGuids(db, item.assetIds);
    return identities ? fingerprintFromIdentityGuids(identities.values()) : null;
}

function getFingerprintForWrite(
    db: DbHandle,
    item: LibraryPresentationItem,
): { fingerprint: string; identityByAssetId: Map<string, string> } {
    const identityByAssetId = ensureAssetIdentityGuids(db, item.assetIds);
    return {
        fingerprint: fingerprintFromIdentityGuids(identityByAssetId.values()),
        identityByAssetId,
    };
}

function loadPreference(db: DbHandle, fingerprint: string): PreferenceRow | undefined {
    return db.prepare(`
        SELECT cluster_fingerprint, preferred_asset_identity_guid, show_separately
        FROM library_presentation_preferences
        WHERE cluster_fingerprint = ?
    `).get(fingerprint) as PreferenceRow | undefined;
}

function resolveCurrentAssetId(db: DbHandle, identityGuid: string): string | null {
    const row = db.prepare(`
        SELECT asset.id
        FROM asset_identities identity
        JOIN assets asset ON asset.original_path = identity.original_path
        WHERE identity.guid = ?
        ORDER BY asset.created_at DESC, asset.id DESC
        LIMIT 1
    `).get(identityGuid) as { id: string } | undefined;
    return row?.id ?? null;
}

function makeSeparateItems(item: LibraryPresentationItem): LibraryPresentationItem[] {
    return item.assetIds.map((assetId) => ({
        presentationKey: `asset:${assetId}`,
        representativeAssetId: assetId,
        relationshipKind: null,
        stackCount: 1,
        assetIds: [assetId],
        momentCount: 1,
    }));
}

function applyPreference(
    db: DbHandle,
    item: LibraryPresentationItem,
    eligibleAssetIds: ReadonlySet<string> | null,
): LibraryPresentationItem[] {
    if (item.stackCount <= 1) {
        return [item];
    }
    const fingerprint = getFingerprintForRead(db, item);
    const preference = fingerprint ? loadPreference(db, fingerprint) : undefined;
    if (!preference) {
        return [item];
    }
    if (preference.show_separately === 1) {
        return makeSeparateItems(item);
    }
    if (!preference.preferred_asset_identity_guid) {
        return [item];
    }
    const preferredAssetId = resolveCurrentAssetId(db, preference.preferred_asset_identity_guid);
    const canUsePreferredAsset = preferredAssetId
        && item.assetIds.includes(preferredAssetId)
        && (!eligibleAssetIds || eligibleAssetIds.has(preferredAssetId));
    return canUsePreferredAsset
        ? [{ ...item, representativeAssetId: preferredAssetId }]
        : [item];
}

export function applyLibraryPresentationPreferences(
    db: DbHandle,
    items: readonly LibraryPresentationItem[],
    eligibleAssetIds: ReadonlySet<string> | null = null,
): LibraryPresentationItem[] {
    return items.flatMap((item) => applyPreference(db, item, eligibleAssetIds));
}

export function setLibraryPresentationCover(
    db: DbHandle,
    item: LibraryPresentationItem,
    assetId: string,
): void {
    if (!item.assetIds.includes(assetId)) {
        throw new Error(`Asset '${assetId}' is not a member of presentation '${item.presentationKey}'.`);
    }
    const { fingerprint, identityByAssetId } = getFingerprintForWrite(db, item);
    const preferredIdentityGuid = identityByAssetId.get(assetId);
    if (!preferredIdentityGuid) {
        throw new Error(`Could not resolve durable identity for asset '${assetId}'.`);
    }
    db.prepare(`
        INSERT INTO library_presentation_preferences (
            cluster_fingerprint,
            preferred_asset_identity_guid,
            show_separately
        )
        VALUES (?, ?, 0)
        ON CONFLICT(cluster_fingerprint) DO UPDATE SET
            preferred_asset_identity_guid = excluded.preferred_asset_identity_guid,
            updated_at = CURRENT_TIMESTAMP
    `).run(fingerprint, preferredIdentityGuid);
}

export function setLibraryPresentationShowSeparately(
    db: DbHandle,
    item: LibraryPresentationItem,
    showSeparately: boolean,
): void {
    const { fingerprint } = getFingerprintForWrite(db, item);
    db.prepare(`
        INSERT INTO library_presentation_preferences (
            cluster_fingerprint,
            show_separately
        )
        VALUES (?, ?)
        ON CONFLICT(cluster_fingerprint) DO UPDATE SET
            show_separately = excluded.show_separately,
            updated_at = CURRENT_TIMESTAMP
    `).run(fingerprint, showSeparately ? 1 : 0);
}
