import type { DatabaseManager } from '../../data/db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export const SYSTEM_BIN_ALBUM_ID = 'system:bin';
export const SYSTEM_BIN_ALBUM_TITLE = 'Bin';
const SYSTEM_BIN_ALBUM_DESCRIPTION = 'Photos removed from the library without deleting the originals.';

export function isBinAlbumId(albumId: string | null | undefined): boolean {
    return albumId === SYSTEM_BIN_ALBUM_ID;
}

export function ensureBinAlbumExists(db: DbHandle) {
    db.prepare(`
        INSERT INTO albums (id, title, description, is_system, system_kind)
        VALUES (?, ?, ?, 1, 'bin')
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            is_system = 1,
            system_kind = 'bin'
    `).run(SYSTEM_BIN_ALBUM_ID, SYSTEM_BIN_ALBUM_TITLE, SYSTEM_BIN_ALBUM_DESCRIPTION);
}
