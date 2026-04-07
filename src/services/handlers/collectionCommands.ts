import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import type { CommandHandlerMap } from './types';
import { toAssetPayload } from './assetPayloadModel';
import type { AssetPayloadRow } from './assetPayloadModel';
import { buildGroupFieldFragments, GROUP_HIERARCHY_CTE } from './assetGroupingQueryFragments';
import { buildAssetDetailFragments, buildLatestDerivedResultJoin } from '../../shared/sql/derivedResults';
import { ensureBinAlbumExists, isBinAlbumId, SYSTEM_BIN_ALBUM_ID } from './binAlbum';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type OrbitMetadataRow = {
    group_type: string | null;
    parent_group_id: string | null;
};

type OrbitItemRow = AssetPayloadRow & {
    item_kind: 'group' | 'asset';
    orbit_group_id: string;
    orbit_group_type: string | null;
};

function loadOrbitMetadata(db: DbHandle, groupId: string): OrbitMetadataRow | undefined {
    return db.prepare(`
        SELECT
            g.type AS group_type,
            agc.parent_group_id AS parent_group_id
        FROM asset_groups g
        LEFT JOIN asset_group_children agc ON agc.child_group_id = g.id
        WHERE g.id = ?
        LIMIT 1
    `).get(groupId) as OrbitMetadataRow | undefined;
}

function loadOrbitChildRows(db: DbHandle, groupId: string): OrbitItemRow[] {
    const groupFields = buildGroupFieldFragments('a');
    const detail = buildAssetDetailFragments({
        detailLevel: 'full',
        includeEvidence: false,
        recAlias: 'r_rec',
        aiNewAlias: 'r_ai_new',
        aiLegacyAlias: 'r_ai_legacy',
        projectionAlias: 'pm',
        photoDateEstimateAlias: 'r_date',
    });

    return db.prepare(`
        ${GROUP_HIERARCHY_CTE}
        SELECT
            'group' AS item_kind,
            child.id AS orbit_group_id,
            child.type AS orbit_group_type,
            child.id AS member_group_id,
            CASE WHEN child.canonical_asset_id = a.id THEN 'canonical' ELSE 'member' END AS member_role,
            CASE WHEN child.canonical_asset_id = a.id THEN -1 ELSE null END AS member_rank,
            null AS member_match_evidence,
            gc_child.stack_count AS stack_count,
            a.id, a.original_path, a.width, a.height, a.file_size, a.created_at, a.photo_created_at, a.photo_created_at_confidence, a.exif_datetime, a.metadata_timestamp_source,
            ${detail.projectionSelect}
            a.sensitivity_score,
            am.sensitivity_status,
            p.path AS preview_path,
            COALESCE(r_faces_new.data, r_faces_legacy.data) AS faces_data,
            ${detail.recSelect}
            ${detail.aiSelect}
            ${detail.photoDateEstimateSelect}
            ${detail.embeddedMetadataSelect}
            (
                SELECT json_group_array(json_object('face_index', fa.face_index, 'person_id', per.id, 'name', per.name))
                FROM face_assignments fa
                JOIN people per ON fa.person_id = per.id
                WHERE fa.asset_id = a.id
            ) AS people_data,
            ${groupFields.groupMembershipsSelect}
            1 AS _query_anchor
        FROM asset_group_children agc
        JOIN asset_groups child ON child.id = agc.child_group_id
        JOIN assets a ON a.id = child.canonical_asset_id
        LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
        ${detail.projectionJoin}
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_faces_new', task: 'face_detection' })}
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_faces_legacy', task: 'face_landmarks' })}
        ${detail.recJoin}
        ${detail.aiJoin}
        ${detail.photoDateEstimateJoin}
        ${detail.embeddedMetadataJoin}
        LEFT JOIN GroupCounts gc_child ON gc_child.group_id = child.id
        LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
        LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
        WHERE agc.parent_group_id = ?
        ORDER BY
            CASE child.type
                WHEN 'burst' THEN 0
                WHEN 'variant_set' THEN 1
                WHEN 'near_duplicate' THEN 2
                WHEN 'duplicate' THEN 3
                ELSE 4
            END,
            CASE WHEN a.photo_created_at IS NULL THEN 1 ELSE 0 END ASC,
            a.photo_created_at DESC,
            a.created_at DESC,
            child.id ASC
    `).all(groupId) as OrbitItemRow[];
}

function loadOrbitDirectAssetRows(db: DbHandle, groupId: string): OrbitItemRow[] {
    const groupFields = buildGroupFieldFragments('a');
    const detail = buildAssetDetailFragments({
        detailLevel: 'full',
        includeEvidence: false,
        recAlias: 'r_rec',
        aiNewAlias: 'r_ai_new',
        aiLegacyAlias: 'r_ai_legacy',
        projectionAlias: 'pm',
        photoDateEstimateAlias: 'r_date',
    });

    return db.prepare(`
        ${GROUP_HIERARCHY_CTE}
        SELECT
            'asset' AS item_kind,
            m.group_id AS orbit_group_id,
            g.type AS orbit_group_type,
            m.group_id AS member_group_id,
            m.role AS member_role,
            m.rank AS member_rank,
            m.evidence_json AS member_match_evidence,
            gc_current.stack_count AS stack_count,
            a.id, a.original_path, a.width, a.height, a.file_size, a.created_at, a.photo_created_at, a.photo_created_at_confidence, a.exif_datetime, a.metadata_timestamp_source,
            ${detail.projectionSelect}
            a.sensitivity_score,
            am.sensitivity_status,
            p.path AS preview_path,
            COALESCE(r_faces_new.data, r_faces_legacy.data) AS faces_data,
            ${detail.recSelect}
            ${detail.aiSelect}
            ${detail.photoDateEstimateSelect}
            ${detail.embeddedMetadataSelect}
            (
                SELECT json_group_array(json_object('face_index', fa.face_index, 'person_id', per.id, 'name', per.name))
                FROM face_assignments fa
                JOIN people per ON fa.person_id = per.id
                WHERE fa.asset_id = a.id
            ) AS people_data,
            ${groupFields.groupMembershipsSelect}
            1 AS _query_anchor
        FROM asset_group_members m
        JOIN assets a ON a.id = m.asset_id
        LEFT JOIN asset_groups g ON g.id = m.group_id
        LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
        ${detail.projectionJoin}
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_faces_new', task: 'face_detection' })}
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_faces_legacy', task: 'face_landmarks' })}
        ${detail.recJoin}
        ${detail.aiJoin}
        ${detail.photoDateEstimateJoin}
        ${detail.embeddedMetadataJoin}
        LEFT JOIN GroupCounts gc_current ON gc_current.group_id = m.group_id
        LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
        LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
        WHERE m.group_id = ?
        ORDER BY
            CASE WHEN m.role = 'canonical' THEN 0 ELSE 1 END,
            COALESCE(m.rank, 999999),
            a.id ASC
    `).all(groupId) as OrbitItemRow[];
}

export const collectionCommandHandlers: CommandHandlerMap = {
    get_group_orbit: (ctx) => {
        const { id, payload, originWs, dbManager, respond } = ctx;
        try {
            const { groupId } = payload as { groupId: string };
            const db = dbManager.getDb();
            const metadata = loadOrbitMetadata(db, groupId);
            if (!metadata) {
                throw new Error(`Group ${groupId} not found`);
            }

            const items = [
                ...loadOrbitChildRows(db, groupId),
                ...loadOrbitDirectAssetRows(db, groupId),
            ].map((row) => ({
                kind: row.item_kind,
                group_id: row.orbit_group_id,
                group_type: row.orbit_group_type,
                stack_count: row.stack_count ?? null,
                asset: toAssetPayload(row),
            }));

            respond(id, 'ok', {
                orbit: {
                    group_id: groupId,
                    group_type: metadata.group_type,
                    parent_group_id: metadata.parent_group_id,
                    items,
                },
            }, null, originWs);
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
