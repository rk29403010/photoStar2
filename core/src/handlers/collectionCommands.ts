import { v4 as uuidv4 } from 'uuid';
import type { CommandHandlerMap } from './types';

export const collectionCommandHandlers: CommandHandlerMap = {
    get_group_orbit: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { groupId } = payload as { groupId: string };
            const orbit = dbManager.getDb().prepare(`
                SELECT
                    m.role, m.rank, m.evidence_json as match_evidence,
                    a.id, a.original_path, a.width, a.height, a.file_size, a.created_at,
                    p.path as preview_path
                FROM asset_group_members m
                JOIN assets a ON a.id = m.asset_id
                LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
                WHERE m.group_id = ?
                ORDER BY
                    CASE WHEN m.role='canonical' THEN 0 ELSE 1 END,
                    COALESCE(m.rank, 999999)
            `).all(groupId);
            respond(id, 'ok', { orbit }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    explode_group: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { groupId } = payload as { groupId: string };
            dbManager.getDb().transaction(() => {
                dbManager.getDb().prepare("UPDATE asset_groups SET status = 'rejected' WHERE id = ?").run(groupId);
                dbManager.getDb().prepare('DELETE FROM asset_group_members WHERE group_id = ?').run(groupId);
            })();
            respond(id, 'ok', { message: 'Group exploded' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    set_canonical: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { groupId, assetId } = payload as { groupId: string; assetId: string };
            dbManager.getDb().transaction(() => {
                dbManager.getDb().prepare("UPDATE asset_groups SET canonical_asset_id = ?, status = 'locked' WHERE id = ?").run(assetId, groupId);
                dbManager.getDb().prepare("UPDATE asset_group_members SET role = 'member' WHERE group_id = ? AND role = 'canonical'").run(groupId);
                dbManager.getDb().prepare("UPDATE asset_group_members SET role = 'canonical', rank = -1 WHERE group_id = ? AND asset_id = ?").run(groupId, assetId);
            })();
            respond(id, 'ok', { message: 'Canonical updated and group locked' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

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

    get_albums: (ctx) => {
        const { id, originWs, dbManager, respond } = ctx;
        try {
            const albums = dbManager.getDb().prepare(`
                SELECT
                    al.id, al.title, al.description, al.rules_json, al.created_at,
                    (SELECT COUNT(*) FROM album_items WHERE album_id = al.id) as item_count,
                    (
                        SELECT p.path
                        FROM previews p
                        WHERE p.asset_id = COALESCE(
                            al.cover_asset_id,
                            (SELECT asset_id FROM album_items WHERE album_id = al.id ORDER BY added_at DESC LIMIT 1)
                        )
                        AND p.size = 'thumbnail'
                        LIMIT 1
                    ) as cover_preview_path
                FROM albums al
                ORDER BY al.title ASC
            `).all();
            respond(id, 'ok', { albums }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_album_items: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { albumId } = payload as { albumId: string };
            const items = dbManager.getDb().prepare(`
                SELECT
                    a.id, a.original_path, a.width, a.height, a.file_size, a.created_at,
                    p.path as preview_path, i.added_at
                FROM album_items i
                JOIN assets a ON a.id = i.asset_id
                LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
                WHERE i.album_id = ?
                ORDER BY i.added_at DESC
            `).all(albumId);
            respond(id, 'ok', { items }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },
};
