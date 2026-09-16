import { v4 as uuidv4 } from 'uuid';
import type { CommandHandlerMap } from './types';
import { ensureBinAlbumExists, isBinAlbumId, SYSTEM_BIN_ALBUM_ID } from './binAlbum';

export const collectionCommandHandlers: CommandHandlerMap = {
    create_album: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { title, description, rules_json: rulesJson } = payload as { title: string; description?: string; rules_json?: string };
            const albumId = uuidv4();
            dbManager.getDb().prepare('INSERT INTO albums (id, title, description, rules_json) VALUES (?, ?, ?, ?)').run(
                albumId,
                title,
                description || null,
                rulesJson || null,
            );
            respond(id, 'ok', { message: 'Album created', albumId }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    update_album: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { albumId, title, description, coverAssetId } = payload as { albumId: string; title?: string; description?: string; coverAssetId?: string };
            const updates: string[] = [];
            const params: string[] = [];

            if (title !== undefined) {
                updates.push('title = ?');
                params.push(title);
            }
            if (description !== undefined) {
                updates.push('description = ?');
                params.push(description);
            }
            if (coverAssetId !== undefined) {
                updates.push('cover_asset_id = ?');
                params.push(coverAssetId);
            }

            if (updates.length > 0) {
                params.push(albumId);
                dbManager.getDb().prepare(`UPDATE albums SET ${updates.join(', ')} WHERE id = ?`).run(...params);
            }
            respond(id, 'ok', { message: 'Album updated' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    delete_album: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { albumId } = payload as { albumId: string };
            if (isBinAlbumId(albumId)) {
                throw new Error('Cannot delete the system Bin album');
            }
            dbManager.getDb().prepare('DELETE FROM albums WHERE id = ?').run(albumId);
            respond(id, 'ok', { message: 'Album deleted' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    add_to_album: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { albumId, assetIds } = payload as { albumId: string; assetIds: string[] };
            const insert = dbManager.getDb().prepare('INSERT OR IGNORE INTO album_items (album_id, asset_id) VALUES (?, ?)');
            dbManager.getDb().transaction(() => {
                for (const assetId of assetIds) {insert.run(albumId, assetId);}
            })();
            respond(id, 'ok', { message: 'Assets added to album' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    remove_from_album: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { albumId, assetIds } = payload as { albumId: string; assetIds: string[] };
            const remove = dbManager.getDb().prepare('DELETE FROM album_items WHERE album_id = ? AND asset_id = ?');
            dbManager.getDb().transaction(() => {
                for (const assetId of assetIds) {remove.run(albumId, assetId);}
            })();
            respond(id, 'ok', { message: 'Assets removed from album' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    move_to_bin: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { assetIds } = payload as { assetIds: string[] };
            const db = dbManager.getDb();
            const updateAsset = db.prepare('UPDATE assets SET binned_at = CURRENT_TIMESTAMP WHERE id = ?');
            const insertBinItem = db.prepare('INSERT OR IGNORE INTO album_items (album_id, asset_id) VALUES (?, ?)');

            db.transaction(() => {
                ensureBinAlbumExists(db);
                for (const assetId of assetIds) {
                    updateAsset.run(assetId);
                    insertBinItem.run(SYSTEM_BIN_ALBUM_ID, assetId);
                }
            })();

            respond(id, 'ok', { message: 'Assets moved to Bin' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    restore_from_bin: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { assetIds } = payload as { assetIds: string[] };
            const db = dbManager.getDb();
            const updateAsset = db.prepare('UPDATE assets SET binned_at = NULL WHERE id = ?');
            const removeBinItem = db.prepare('DELETE FROM album_items WHERE album_id = ? AND asset_id = ?');

            db.transaction(() => {
                ensureBinAlbumExists(db);
                for (const assetId of assetIds) {
                    updateAsset.run(assetId);
                    removeBinItem.run(SYSTEM_BIN_ALBUM_ID, assetId);
                }
            })();

            respond(id, 'ok', { message: 'Assets restored from Bin' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_albums: (ctx) => {
        const { id, originWs, dbManager, respond } = ctx;
        try {
            const db = dbManager.getDb();
            ensureBinAlbumExists(db);
            const albums = db.prepare(`
                SELECT
                    al.id,
                    al.title,
                    al.description,
                    al.cover_asset_id,
                    al.rules_json,
                    al.is_system,
                    al.system_kind,
                    al.created_at,
                    (
                        SELECT COUNT(*)
                        FROM album_items ai
                        JOIN assets a ON a.id = ai.asset_id
                        WHERE ai.album_id = al.id
                          AND (
                            (al.id = ? AND a.binned_at IS NOT NULL)
                            OR (al.id != ? AND a.binned_at IS NULL)
                          )
                    ) as item_count,
                    (
                        SELECT p.path
                        FROM previews p
                        WHERE p.asset_id = COALESCE(al.cover_asset_id, (
                            SELECT ai.asset_id
                            FROM album_items ai
                            JOIN assets a ON a.id = ai.asset_id
                            WHERE ai.album_id = al.id
                              AND (
                                (al.id = ? AND a.binned_at IS NOT NULL)
                                OR (al.id != ? AND a.binned_at IS NULL)
                              )
                            ORDER BY ai.added_at DESC
                            LIMIT 1
                        ))
                        AND p.size = 'thumbnail'
                        LIMIT 1
                    ) as cover_preview_path
                FROM albums al
                ORDER BY al.title ASC
            `).all(SYSTEM_BIN_ALBUM_ID, SYSTEM_BIN_ALBUM_ID, SYSTEM_BIN_ALBUM_ID, SYSTEM_BIN_ALBUM_ID);
            respond(id, 'ok', { albums }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_album_items: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { albumId } = payload as { albumId: string };
            const db = dbManager.getDb();
            ensureBinAlbumExists(db);
            const items = db.prepare(`
                SELECT
                    a.id, a.original_path, a.width, a.height, a.file_size, a.created_at, a.binned_at,
                    p.path as preview_path, i.added_at
                FROM album_items i
                JOIN assets a ON a.id = i.asset_id
                LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
                WHERE i.album_id = ?
                  AND (
                    (? = 1 AND a.binned_at IS NOT NULL)
                    OR (? = 0 AND a.binned_at IS NULL)
                  )
                ORDER BY i.added_at DESC
            `).all(albumId, isBinAlbumId(albumId) ? 1 : 0, isBinAlbumId(albumId) ? 1 : 0);
            respond(id, 'ok', { items }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },
};
