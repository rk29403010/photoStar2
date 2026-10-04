import type { DatabaseManager } from '../../data/db';
import type { EventBus } from '../events/bus';
import { queuePhotoEvidenceChange } from '../../data/relatedPhotoQueue';
import { loadEventMembers, reconsiderEventMembership } from './events';
import { propagateEventEvidence } from './propagation';
import { strengthenEventIdentityCandidates } from './identityCandidates';
import { reconsiderRefinementOpportunities } from './opportunities';
import { previousArchiveState, recordArchiveImpacts } from './impacts';

/** One atomic neighbourhood per queue item. The caller yields between items. */
export function processPhotoReconsideration(manager: DatabaseManager, assetId: string, cause: string) {
    const db = manager.getDb();
    return db.transaction(() => {
        const event = reconsiderEventMembership(manager, assetId);
        const ids = event ? loadEventMembers(manager, event.id).map(member => member.assetId) : [assetId];
        const before = new Map(ids.map(id => [id, previousArchiveState(manager, id)]));
        if (event) {
            propagateEventEvidence(manager, event);
            strengthenEventIdentityCandidates(manager, event);
        }
        reconsiderRefinementOpportunities(manager, event, assetId);
        const impacts = ids.flatMap(id => recordArchiveImpacts(manager, id, cause, before.get(id)!));
        return { assetIds: ids, impacts };
    })();
}

export function drainRelatedPhotoQueue(manager: DatabaseManager, limit = 4, eventBus?: EventBus): number {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) { throw new Error('Queue batch must be 1..20'); }
    const db = manager.getDb();
    const rows = db.prepare(`SELECT asset_id, cause, revision FROM related_photo_queue WHERE status = 'pending'
        ORDER BY updated_at, asset_id LIMIT ?`).all(limit) as { asset_id: string; cause: string; revision: number }[];
    for (const row of rows) {
        try {
            db.prepare("UPDATE related_photo_queue SET status = 'running' WHERE asset_id = ? AND revision = ?").run(row.asset_id, row.revision);
            const result = processPhotoReconsideration(manager, row.asset_id, row.cause);
            db.prepare('DELETE FROM related_photo_queue WHERE asset_id = ? AND revision = ?').run(row.asset_id, row.revision);
            for (const impact of result.impacts) { eventBus?.emit({ type: 'ArchiveImpactRecorded', impact }); }
            for (const id of result.assetIds) { eventBus?.emit({ type: 'AssetUpdated', assetId: id, source: 'related-photo-network' }); }
        } catch (error) {
            db.prepare(`UPDATE related_photo_queue SET status = 'failed', attempts = attempts + 1, error = ?
                WHERE asset_id = ? AND revision = ?`).run(error instanceof Error ? error.message : String(error), row.asset_id, row.revision);
        }
    }
    return rows.length;
}

/** No paid analysis here. Only context-sensitive Refine opportunities are queued. */
export function startRelatedPhotoWorker(manager: DatabaseManager, eventBus: EventBus): () => void {
    const db = manager.getDb();
    db.prepare("UPDATE related_photo_queue SET status = 'pending' WHERE status = 'running'").run();
    const queueEvent = (assetId: string, cause: string) => queuePhotoEvidenceChange(db, assetId, cause);
    const unsubscribeImport = eventBus.subscribe('MediaDiscovered', event => { if (event.type === 'MediaDiscovered') { queueEvent(event.mediaId, 'import'); } });
    const unsubscribeAsset = eventBus.subscribe('AssetUpdated', event => {
        if (event.type === 'AssetUpdated' && event.source !== 'related-photo-network') { queueEvent(event.assetId, 'asset-change'); }
    });
    const unsubscribeFaces = eventBus.subscribe('FacesDetected', event => { if (event.type === 'FacesDetected') { queueEvent(event.mediaId, 'faces'); } });
    const unsubscribeEmbedding = eventBus.subscribe('FaceEmbeddingGenerated', event => { if (event.type === 'FaceEmbeddingGenerated') { queueEvent(event.mediaId, 'face-embedding'); } });
    const timer = setInterval(() => {
        if (manager.getSetting('system_paused') === 'true') { return; }
        try { drainRelatedPhotoQueue(manager, 1, eventBus); }
        catch (error) { console.error('[Related photos] Reconsideration failed:', error); }
    }, 500);
    timer.unref();
    return () => {
        clearInterval(timer);
        for (const unsubscribe of [unsubscribeImport, unsubscribeAsset, unsubscribeFaces, unsubscribeEmbedding]) { unsubscribe(); }
    };
}
