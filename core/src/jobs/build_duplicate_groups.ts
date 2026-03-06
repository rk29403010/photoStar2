import { DatabaseManager } from '../db';
import { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { v4 as uuidv4 } from 'uuid';

export async function runDuplicateGroupingJob(
    jobId: string,
    dbManager: DatabaseManager,
    eventBus: EventBus,
    signal?: AbortSignal
) {
    const db = dbManager.getDb();

    eventBus.emit({
        type: 'JobStarted',
        jobId: jobId,
        pipelineStage: 'similarity_cluster'
    });

    let processedGroups = 0;

    // Find file hashes that appear more than once
    const duplicateHashes = db.prepare(`
        SELECT file_hash, COUNT(*) as count 
        FROM assets 
        WHERE file_hash IS NOT NULL 
        GROUP BY file_hash 
        HAVING count > 1
    `).all() as { file_hash: string, count: number }[];

    if (duplicateHashes.length === 0) {
        eventBus.emit({
            type: 'JobCompleted',
            jobId: jobId,
            pipelineStage: 'similarity_cluster'
        });
        return;
    }

    const reportProgress = (processed: number, total: number) => {
        eventBus.emit({
            type: 'JobProgress',
            jobId: jobId,
            processedItems: processed,
            totalItems: total,
        });
    };

    for (const hashData of duplicateHashes) {
        if (signal?.aborted) break;
        await waitIfPaused();

        db.transaction(() => {
            // Get all assets with this hash
            const assets = db.prepare(`
                SELECT id, width, height, file_size, exif_datetime 
                FROM assets 
                WHERE file_hash = ?
                ORDER BY width * height DESC, file_size DESC, exif_datetime ASC
            `).all(hashData.file_hash) as { id: string, width: number | null, height: number | null, file_size: number | null, exif_datetime: string | null }[];

            if (assets.length < 2) return;

            // Check if a confirmed or locked group already maps to these assets
            // Note: Simplification - we just look if the canonical asset is already in a duplicate group
            const existingMember = db.prepare(`
                SELECT g.id, g.status
                FROM asset_groups g
                JOIN asset_group_members m ON m.group_id = g.id
                WHERE m.asset_id = ? AND g.type = 'duplicate'
                LIMIT 1
            `).get(assets[0].id) as { id: string, status: string } | undefined;

            if (existingMember?.status === 'locked') {
                return; // Can't touch it
            }

            let groupId = existingMember?.id;

            if (!groupId) {
                groupId = uuidv4();
                db.prepare(`
                    INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
                    VALUES (?, 'duplicate', 'confirmed', ?, '1.0', '{}')
                `).run(groupId, assets[0].id);
            } else {
                // Update canonical if needed, keep confirmed status
                db.prepare(`
                    UPDATE asset_groups 
                    SET canonical_asset_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(assets[0].id, groupId);
            }

            // Wipe old memberships for this group and re-insert
            db.prepare('DELETE FROM asset_group_members WHERE group_id = ?').run(groupId);

            const insertMember = db.prepare(`
                INSERT INTO asset_group_members (group_id, asset_id, role, rank)
                VALUES (?, ?, ?, ?)
            `);

            for (let i = 0; i < assets.length; i++) {
                const role = i === 0 ? 'canonical' : 'member';
                insertMember.run(groupId, assets[i].id, role, i);
            }

        })();

        processedGroups++;
        if (processedGroups % 10 === 0) {
            reportProgress(processedGroups, duplicateHashes.length);
        }
    }

    reportProgress(duplicateHashes.length, duplicateHashes.length);

    eventBus.emit({
        type: 'JobCompleted',
        jobId: jobId,
        pipelineStage: 'similarity_cluster'
    });
}
