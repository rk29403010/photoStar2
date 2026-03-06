import { DatabaseManager } from '../db';
import { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { hammingDistance } from '../math-utils';
import { v4 as uuidv4 } from 'uuid';

export async function runBurstGroupingJob(
    jobId: string,
    dbManager: DatabaseManager,
    eventBus: EventBus
) {
    const db = dbManager.getDb();

    eventBus.emit({
        type: 'JobStarted',
        jobId: jobId,
        pipelineStage: 'similarity_cluster'
    });

    const T_BURST_SECONDS = 3;
    const T_PHASH_BURST = 12; // Moderate similarity required if phash exists

    // Fetch all assets with exif_datetime, ordered by time
    // We only consider assets not already in a 'locked' or 'confirmed' group of any type?
    // Actually, bursts might overlap with duplicates. 
    // Spec says: "group into bursts if within T_burst_seconds and visually similar enough"
    
    const assets = db.prepare(`
        SELECT a.id, a.exif_datetime, a.width, a.height, a.file_size, f.phash64
        FROM assets a
        LEFT JOIN asset_features f ON a.id = f.asset_id
        WHERE a.exif_datetime IS NOT NULL
        ORDER BY a.exif_datetime ASC
    `).all() as { id: string, exif_datetime: string, width: number | null, height: number | null, file_size: number | null, phash64: string | null }[];

    if (assets.length < 2) {
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

    let processedCount = 0;
    const handled = new Set<string>();

    for (let i = 0; i < assets.length; i++) {
        await waitIfPaused();
        const a1 = assets[i];

        if (handled.has(a1.id)) {
            processedCount++;
            continue;
        }

        // Check if a1 is already firmly in a group
        const existingStatus = db.prepare(`
            SELECT status FROM asset_groups g
            JOIN asset_group_members m ON m.group_id = g.id
            WHERE m.asset_id = ?
            LIMIT 1
        `).get(a1.id) as { status: string } | undefined;

        if (existingStatus?.status === 'locked' || existingStatus?.status === 'confirmed') {
            handled.add(a1.id);
            processedCount++;
            continue;
        }

        const cluster = [a1];
        const t1 = new Date(a1.exif_datetime).getTime();

        // Peek forward for burst candidates
        for (let j = i + 1; j < assets.length; j++) {
            const a2 = assets[j];
            if (handled.has(a2.id)) continue;

            const t2 = new Date(a2.exif_datetime).getTime();
            const diffSec = Math.abs(t2 - t1) / 1000;

            if (diffSec > T_BURST_SECONDS) break; // Too far apart in time

            // Time matches. If we have phash, verify visual similarity
            let isSimilar = true;
            if (a1.phash64 && a2.phash64) {
                const dist = hammingDistance(a1.phash64, a2.phash64);
                if (dist > T_PHASH_BURST) {
                    isSimilar = false;
                }
            }

            if (isSimilar) {
                // Ensure a2 isn't locked
                const a2Status = db.prepare(`
                    SELECT status FROM asset_groups g
                    JOIN asset_group_members m ON m.group_id = g.id
                    WHERE m.asset_id = ?
                    LIMIT 1
                `).get(a2.id) as { status: string } | undefined;

                if (a2Status?.status !== 'locked' && a2Status?.status !== 'confirmed') {
                    cluster.push(a2);
                }
            }
        }

        if (cluster.length > 1) {
            // Found a burst!
            db.transaction(() => {
                const groupId = uuidv4();
                
                // Sort cluster to find canonical (highest res)
                cluster.sort((a, b) => {
                    const aArea = (a.width || 0) * (a.height || 0);
                    const bArea = (b.width || 0) * (b.height || 0);
                    if (aArea !== bArea) return bArea - aArea;
                    return (b.file_size || 0) - (a.file_size || 0);
                });

                const canonicalId = cluster[0].id;

                db.prepare(`
                    INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
                    VALUES (?, 'burst', 'proposed', ?, '1.0', ?)
                `).run(groupId, canonicalId, JSON.stringify({ t_burst: T_BURST_SECONDS }));

                const insertMember = db.prepare(`
                    INSERT INTO asset_group_members (group_id, asset_id, role, rank)
                    VALUES (?, ?, ?, ?)
                `);

                for (let k = 0; k < cluster.length; k++) {
                    insertMember.run(groupId, cluster[k].id, k === 0 ? 'canonical' : 'member', k);
                    handled.add(cluster[k].id);
                }
            })();
        }

        processedCount++;
        if (processedCount % 50 === 0) {
            reportProgress(processedCount, assets.length);
        }
    }

    reportProgress(assets.length, assets.length);

    eventBus.emit({
        type: 'JobCompleted',
        jobId: jobId,
        pipelineStage: 'similarity_cluster'
    });
}
