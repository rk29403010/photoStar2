import { DatabaseManager } from '../db';
import { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { hammingDistance } from '../math-utils';
import { v4 as uuidv4 } from 'uuid';

export async function runVariantGroupingJob(
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

    const thresholdSetting = dbManager.getSetting('job_variant_threshold');
    const T_PHASH_VARIANT = thresholdSetting ? parseInt(thresholdSetting, 10) : 10; // Max allowed distance

    // Fetch all features
    const features = db.prepare(`
        SELECT f.asset_id, f.phash64, a.width, a.height, a.file_size, a.exif_datetime
        FROM asset_features f
        JOIN assets a ON a.id = f.asset_id
        WHERE f.phash64 IS NOT NULL
    `).all() as { asset_id: string, phash64: string, width: number | null, height: number | null, file_size: number | null, exif_datetime: string | null }[];

    if (features.length < 2) {
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

    // To prevent quadratic explosion, we ideally need a VPTree or LSH.
    // Given JS and a simple SQLite constraint, we'll do an O(N^2) naive check for now, 
    // but only on unbound assets or inside small clusters.
    // For V1, let's just group them greedily.

    let processed = 0;
    const handled = new Set<string>();

    const insertGroup = db.prepare(`
        INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
        VALUES (?, 'variant_set', 'proposed', ?, '1.0', ?)
    `);

    const insertMember = db.prepare(`
        INSERT INTO asset_group_members (group_id, asset_id, role, rank)
        VALUES (?, ?, ?, ?)
    `);

    const insertEdge = db.prepare(`
        INSERT OR IGNORE INTO asset_similarity_edges (asset_id_a, asset_id_b, kind, score, reason, algorithm_version)
        VALUES (?, ?, 'visual', ?, 'phash', '1.0')
    `);

    for (let i = 0; i < features.length; i++) {
        if (signal?.aborted) break;
        await waitIfPaused();
        const f1 = features[i];

        if (handled.has(f1.asset_id)) {
            processed++;
            continue;
        }

        // Check if f1 is already firmly in a group we shouldn't touch
        const existingStatus = db.prepare(`
            SELECT status FROM asset_groups g
            JOIN asset_group_members m ON m.group_id = g.id
            WHERE m.asset_id = ?
            LIMIT 1
        `).get(f1.asset_id) as { status: string } | undefined;

        if (existingStatus?.status === 'locked' || existingStatus?.status === 'confirmed') {
            handled.add(f1.asset_id);
            processed++;
            continue;
        }

        const cluster: typeof features = [f1];
        handled.add(f1.asset_id);

        for (let j = i + 1; j < features.length; j++) {
            const f2 = features[j];
            if (handled.has(f2.asset_id)) continue;

            const dist = hammingDistance(f1.phash64, f2.phash64);

            if (dist <= T_PHASH_VARIANT) {
                // Ensure f2 isnt locked
                const f2Status = db.prepare(`
                    SELECT status FROM asset_groups g
                    JOIN asset_group_members m ON m.group_id = g.id
                    WHERE m.asset_id = ?
                    LIMIT 1
                `).get(f2.asset_id) as { status: string } | undefined;

                if (f2Status?.status !== 'locked' && f2Status?.status !== 'confirmed') {
                    cluster.push(f2);
                    handled.add(f2.asset_id);

                    // Record the edge (min id first)
                    const [idA, idB] = f1.asset_id < f2.asset_id ? [f1.asset_id, f2.asset_id] : [f2.asset_id, f1.asset_id];
                    // Score is normalized. Max dist is 64. So score = 1 - (dist/64)
                    const score = 1.0 - (dist / 64.0);
                    insertEdge.run(idA, idB, score);
                }
            }
        }

        if (cluster.length > 1) {
            // Sort to find canonical: assume highest resolution, then file size
            cluster.sort((a, b) => {
                const aArea = (a.width || 0) * (a.height || 0);
                const bArea = (b.width || 0) * (b.height || 0);
                if (aArea !== bArea) return bArea - aArea;
                return (b.file_size || 0) - (a.file_size || 0);
            });

            db.transaction(() => {
                const canonicalId = cluster[0].asset_id;
                const groupId = uuidv4();

                const paramsJson = JSON.stringify({ threshold: T_PHASH_VARIANT });

                insertGroup.run(groupId, canonicalId, paramsJson);

                for (let k = 0; k < cluster.length; k++) {
                    const role = k === 0 ? 'canonical' : 'member';
                    insertMember.run(groupId, cluster[k].asset_id, role, k);
                }
            })();
        }

        processed++;
        if (processed % 10 === 0) {
            reportProgress(processed, features.length);
        }
    }

    reportProgress(features.length, features.length);

    eventBus.emit({
        type: 'JobCompleted',
        jobId: jobId,
        pipelineStage: 'similarity_cluster'
    });
}
