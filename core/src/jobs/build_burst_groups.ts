import type { DatabaseManager } from '../db';
import type { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { hammingDistance } from '../math-utils';
import { v4 as uuidv4 } from 'uuid';

type BurstAsset = {
    id: string;
    exif_datetime: string;
    width: number | null;
    height: number | null;
    file_size: number | null;
    phash64: string | null;
};

function emitJob(eventBus: EventBus, jobId: string, type: 'JobStarted' | 'JobCompleted'): void {
    eventBus.emit({ type, jobId, pipelineStage: 'similarity_cluster' });
}

function emitProgress(eventBus: EventBus, jobId: string, processed: number, total: number): void {
    eventBus.emit({
        type: 'JobProgress',
        jobId,
        processedItems: processed,
        totalItems: total,
    });
}

function getOrderedAssets(dbManager: DatabaseManager): BurstAsset[] {
    return dbManager.getDb().prepare(`
        SELECT a.id, a.exif_datetime, a.width, a.height, a.file_size, f.phash64
        FROM assets a
        LEFT JOIN asset_features f ON a.id = f.asset_id
        WHERE a.exif_datetime IS NOT NULL
        ORDER BY a.exif_datetime ASC
    `).all() as BurstAsset[];
}

function getStatus(dbManager: DatabaseManager, assetId: string): string | undefined {
    const row = dbManager.getDb().prepare(`
        SELECT status FROM asset_groups g
        JOIN asset_group_members m ON m.group_id = g.id
        WHERE m.asset_id = ?
        LIMIT 1
    `).get(assetId) as { status: string } | undefined;
    return row?.status;
}

function isProtected(status: string | undefined): boolean {
    return status === 'locked' || status === 'confirmed';
}

function isTimeAndVisualMatch(anchor: BurstAsset, candidate: BurstAsset, maxSeconds: number, maxDistance: number): boolean {
    const t1 = new Date(anchor.exif_datetime).getTime();
    const t2 = new Date(candidate.exif_datetime).getTime();
    const diffSec = Math.abs(t2 - t1) / 1000;
    if (diffSec > maxSeconds) {return false;}
    if (!anchor.phash64 || !candidate.phash64) {return true;}
    return hammingDistance(anchor.phash64, candidate.phash64) <= maxDistance;
}

function persistBurstGroup(
    dbManager: DatabaseManager,
    cluster: BurstAsset[],
    maxSeconds: number,
    handled: Set<string>
): void {
    const db = dbManager.getDb();
    db.transaction(() => {
        cluster.sort((a, b) => {
            const aArea = (a.width || 0) * (a.height || 0);
            const bArea = (b.width || 0) * (b.height || 0);
            if (aArea !== bArea) {return bArea - aArea;}
            return (b.file_size || 0) - (a.file_size || 0);
        });

        const groupId = uuidv4();
        db.prepare(`
            INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
            VALUES (?, 'burst', 'proposed', ?, '1.0', ?)
        `).run(groupId, cluster[0].id, JSON.stringify({ t_burst: maxSeconds }));

        const insertMember = db.prepare(`
            INSERT INTO asset_group_members (group_id, asset_id, role, rank)
            VALUES (?, ?, ?, ?)
        `);

        for (let index = 0; index < cluster.length; index++) {
            insertMember.run(groupId, cluster[index].id, index === 0 ? 'canonical' : 'member', index);
            handled.add(cluster[index].id);
        }
    })();
}

function collectBurstCluster(
    dbManager: DatabaseManager,
    assets: BurstAsset[],
    startIndex: number,
    handled: Set<string>,
    maxSeconds: number,
    maxDistance: number
): BurstAsset[] {
    const anchor = assets[startIndex];
    const cluster: BurstAsset[] = [anchor];
    const anchorTime = new Date(anchor.exif_datetime).getTime();

    for (let j = startIndex + 1; j < assets.length; j++) {
        const candidate = assets[j];
        if (handled.has(candidate.id)) {continue;}

        const candidateTime = new Date(candidate.exif_datetime).getTime();
        const diffSec = Math.abs(candidateTime - anchorTime) / 1000;
        if (diffSec > maxSeconds) {break;}

        if (!isTimeAndVisualMatch(anchor, candidate, maxSeconds, maxDistance)) {continue;}
        if (isProtected(getStatus(dbManager, candidate.id))) {continue;}
        cluster.push(candidate);
    }

    return cluster;
}

export async function runBurstGroupingJob(
    jobId: string,
    dbManager: DatabaseManager,
    eventBus: EventBus
) {
    emitJob(eventBus, jobId, 'JobStarted');

    const T_BURST_SECONDS = 3;
    const T_PHASH_BURST = 12;
    const assets = getOrderedAssets(dbManager);

    if (assets.length < 2) {
        emitJob(eventBus, jobId, 'JobCompleted');
        return;
    }

    let processedCount = 0;
    const handled = new Set<string>();

    for (let i = 0; i < assets.length; i++) {
        await waitIfPaused();
        const anchor = assets[i];
        if (handled.has(anchor.id)) {
            processedCount++;
            continue;
        }

        if (isProtected(getStatus(dbManager, anchor.id))) {
            handled.add(anchor.id);
            processedCount++;
            continue;
        }

        const cluster = collectBurstCluster(dbManager, assets, i, handled, T_BURST_SECONDS, T_PHASH_BURST);
        if (cluster.length > 1) {persistBurstGroup(dbManager, cluster, T_BURST_SECONDS, handled);}

        processedCount++;
        if (processedCount % 50 === 0) {
            emitProgress(eventBus, jobId, processedCount, assets.length);
        }
    }

    emitProgress(eventBus, jobId, assets.length, assets.length);
    emitJob(eventBus, jobId, 'JobCompleted');
}
