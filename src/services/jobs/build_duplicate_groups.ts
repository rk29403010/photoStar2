import type { DatabaseManager } from '../../data/db';
import type { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { v4 as uuidv4 } from 'uuid';

type DuplicateHashRow = { file_hash: string, count: number };
type DuplicateAssetRow = {
    id: string;
    width: number | null;
    height: number | null;
    file_size: number | null;
    exif_datetime: string | null;
};

function emitJobStarted(eventBus: EventBus, jobId: string): void {
    eventBus.emit({
        type: 'JobStarted',
        jobId,
        pipelineStage: 'similarity_cluster'
    });
}

function emitJobCompleted(eventBus: EventBus, jobId: string): void {
    eventBus.emit({
        type: 'JobCompleted',
        jobId,
        pipelineStage: 'similarity_cluster'
    });
}

function emitJobProgress(eventBus: EventBus, jobId: string, processed: number, total: number): void {
    eventBus.emit({
        type: 'JobProgress',
        jobId,
        processedItems: processed,
        totalItems: total,
    });
}

function getDuplicateHashes(dbManager: DatabaseManager): DuplicateHashRow[] {
    return dbManager.getDb().prepare(`
        SELECT file_hash, COUNT(*) as count 
        FROM assets 
        WHERE file_hash IS NOT NULL 
        GROUP BY file_hash 
        HAVING count > 1
    `).all() as DuplicateHashRow[];
}

function processDuplicateHash(dbManager: DatabaseManager, hash: string): void {
    const db = dbManager.getDb();
    db.transaction(() => {
        const assets = db.prepare(`
            SELECT id, width, height, file_size, exif_datetime 
            FROM assets 
            WHERE file_hash = ?
            ORDER BY width * height DESC, file_size DESC, exif_datetime ASC
        `).all(hash) as DuplicateAssetRow[];

        if (assets.length < 2) {return;}

        const existingMember = db.prepare(`
            SELECT g.id, g.status
            FROM asset_groups g
            JOIN asset_group_members m ON m.group_id = g.id
            WHERE m.asset_id = ? AND g.type = 'duplicate'
            LIMIT 1
        `).get(assets[0].id) as { id: string, status: string } | undefined;

        if (existingMember?.status === 'locked') {return;}

        const groupId = existingMember?.id || uuidv4();
        if (!existingMember?.id) {
            db.prepare(`
                INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
                VALUES (?, 'duplicate', 'confirmed', ?, '1.0', '{}')
            `).run(groupId, assets[0].id);
        } else {
            db.prepare(`
                UPDATE asset_groups 
                SET canonical_asset_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(assets[0].id, groupId);
        }

        db.prepare('DELETE FROM asset_group_members WHERE group_id = ?').run(groupId);
        const insertMember = db.prepare(`
            INSERT INTO asset_group_members (group_id, asset_id, role, rank)
            VALUES (?, ?, ?, ?)
        `);

        for (let i = 0; i < assets.length; i++) {
            insertMember.run(groupId, assets[i].id, i === 0 ? 'canonical' : 'member', i);
        }
    })();
}

export async function runDuplicateGroupingJob(
    jobId: string,
    dbManager: DatabaseManager,
    eventBus: EventBus,
    signal?: AbortSignal
) {
    emitJobStarted(eventBus, jobId);

    let processedGroups = 0;
    const duplicateHashes = getDuplicateHashes(dbManager);

    if (duplicateHashes.length === 0) {
        emitJobCompleted(eventBus, jobId);
        return;
    }

    for (const hashData of duplicateHashes) {
        if (signal?.aborted) {break;}
        await waitIfPaused();
        processDuplicateHash(dbManager, hashData.file_hash);

        processedGroups++;
        if (processedGroups % 10 === 0) {
            emitJobProgress(eventBus, jobId, processedGroups, duplicateHashes.length);
        }
    }

    emitJobProgress(eventBus, jobId, duplicateHashes.length, duplicateHashes.length);
    emitJobCompleted(eventBus, jobId);
}
