import type { DatabaseManager } from '../db';
import type { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { hammingDistance } from '../math-utils';
import { v4 as uuidv4 } from 'uuid';

type VariantFeature = {
    asset_id: string;
    phash64: string;
    width: number | null;
    height: number | null;
    file_size: number | null;
    exif_datetime: string | null;
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

function getVariantFeatures(dbManager: DatabaseManager): VariantFeature[] {
    return dbManager.getDb().prepare(`
        SELECT f.asset_id, f.phash64, a.width, a.height, a.file_size, a.exif_datetime
        FROM asset_features f
        JOIN assets a ON a.id = f.asset_id
        WHERE f.phash64 IS NOT NULL
    `).all() as VariantFeature[];
}

function getAssetGroupStatus(dbManager: DatabaseManager, assetId: string): string | undefined {
    const row = dbManager.getDb().prepare(`
        SELECT status FROM asset_groups g
        JOIN asset_group_members m ON m.group_id = g.id
        WHERE m.asset_id = ?
        LIMIT 1
    `).get(assetId) as { status: string } | undefined;
    return row?.status;
}

function shouldSkipLockedOrConfirmed(status: string | undefined): boolean {
    return status === 'locked' || status === 'confirmed';
}

function sortByCanonicalPriority(cluster: VariantFeature[]): void {
    cluster.sort((a, b) => {
        const aArea = (a.width || 0) * (a.height || 0);
        const bArea = (b.width || 0) * (b.height || 0);
        if (aArea !== bArea) {return bArea - aArea;}
        return (b.file_size || 0) - (a.file_size || 0);
    });
}

function persistVariantCluster(
    dbManager: DatabaseManager,
    cluster: VariantFeature[],
    threshold: number
): void {
    const db = dbManager.getDb();
    const insertGroup = db.prepare(`
        INSERT INTO asset_groups (id, type, status, canonical_asset_id, algorithm_version, params_json)
        VALUES (?, 'variant_set', 'proposed', ?, '1.0', ?)
    `);
    const insertMember = db.prepare(`
        INSERT INTO asset_group_members (group_id, asset_id, role, rank)
        VALUES (?, ?, ?, ?)
    `);

    sortByCanonicalPriority(cluster);
    const canonicalId = cluster[0].asset_id;
    const paramsJson = JSON.stringify({ threshold });

    db.transaction(() => {
        const groupId = uuidv4();
        insertGroup.run(groupId, canonicalId, paramsJson);
        for (let index = 0; index < cluster.length; index++) {
            insertMember.run(groupId, cluster[index].asset_id, index === 0 ? 'canonical' : 'member', index);
        }
    })();
}

function buildCluster(
    anchor: VariantFeature,
    features: VariantFeature[],
    startIndex: number,
    threshold: number,
    handled: Set<string>,
    dbManager: DatabaseManager
): VariantFeature[] {
    const cluster: VariantFeature[] = [anchor];
    handled.add(anchor.asset_id);

    const db = dbManager.getDb();
    const insertEdge = db.prepare(`
        INSERT OR IGNORE INTO asset_similarity_edges (asset_id_a, asset_id_b, kind, score, reason, algorithm_version)
        VALUES (?, ?, 'visual', ?, 'phash', '1.0')
    `);

    for (let j = startIndex + 1; j < features.length; j++) {
        const candidate = features[j];
        if (handled.has(candidate.asset_id)) {continue;}

        const dist = hammingDistance(anchor.phash64, candidate.phash64);
        if (dist > threshold) {continue;}

        const status = getAssetGroupStatus(dbManager, candidate.asset_id);
        if (shouldSkipLockedOrConfirmed(status)) {continue;}

        cluster.push(candidate);
        handled.add(candidate.asset_id);

        const [idA, idB] = anchor.asset_id < candidate.asset_id
            ? [anchor.asset_id, candidate.asset_id]
            : [candidate.asset_id, anchor.asset_id];
        insertEdge.run(idA, idB, 1.0 - (dist / 64.0));
    }

    return cluster;
}

export async function runVariantGroupingJob(
    jobId: string,
    dbManager: DatabaseManager,
    eventBus: EventBus,
    signal?: AbortSignal
) {
    emitJob(eventBus, jobId, 'JobStarted');

    const thresholdSetting = dbManager.getSetting('job_variant_threshold');
    const T_PHASH_VARIANT = thresholdSetting ? parseInt(thresholdSetting, 10) : 10;
    const features = getVariantFeatures(dbManager);

    if (features.length < 2) {
        emitJob(eventBus, jobId, 'JobCompleted');
        return;
    }

    let processed = 0;
    const handled = new Set<string>();

    for (let i = 0; i < features.length; i++) {
        if (signal?.aborted) {break;}
        await waitIfPaused();
        const anchor = features[i];
        if (handled.has(anchor.asset_id)) {
            processed++;
            continue;
        }

        const anchorStatus = getAssetGroupStatus(dbManager, anchor.asset_id);
        if (shouldSkipLockedOrConfirmed(anchorStatus)) {
            handled.add(anchor.asset_id);
            processed++;
            continue;
        }

        const cluster = buildCluster(anchor, features, i, T_PHASH_VARIANT, handled, dbManager);
        if (cluster.length > 1) {persistVariantCluster(dbManager, cluster, T_PHASH_VARIANT);}

        processed++;
        if (processed % 10 === 0) {
            emitProgress(eventBus, jobId, processed, features.length);
        }
    }

    emitProgress(eventBus, jobId, features.length, features.length);
    emitJob(eventBus, jobId, 'JobCompleted');
}
