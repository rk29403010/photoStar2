import type { DatabaseManager } from '../../data/db';
import type { AnalysisSource } from '../../shared/photoAnalysis/contracts';

/** Bounded event facts are attributed roots, not unqualified copied metadata. */
export function retrieveRelatedEventContext(manager: DatabaseManager, assetId: string, prefix: string, limit = 8): AnalysisSource[] {
    const rows = manager.getDb().prepare(`SELECT DISTINCT claim.id, claim.asset_id, claim.field, claim.value_json,
        own.event_id, own.revision AS own_revision, peer.revision AS peer_revision
        FROM photo_event_members own JOIN photo_event_members peer ON peer.event_id = own.event_id
        JOIN photo_analysis_winners claim ON claim.asset_id = peer.asset_id
        WHERE own.asset_id = ? AND own.state = 'active' AND peer.state = 'active' AND own.asset_id <> peer.asset_id
          AND claim.field IN ('date','location') AND claim.kind IN ('known_fact','user_confirmed')
          AND claim.subject_id IS NULL AND claim.value_json <> 'null'
        ORDER BY claim.id, own.event_id LIMIT ?`).all(assetId, Math.min(8, Math.max(0, limit))) as {
            id: string; asset_id: string; field: string; value_json: string; event_id: string; own_revision: number; peer_revision: number;
        }[];
    return rows.map((row, index) => ({ id: `${prefix}:event:${index}`, assetId, kind: 'related_photo', refId: row.id,
        rootClaimIds: [row.id], memberships: [{ eventId: row.event_id, assetId, revision: row.own_revision },
            { eventId: row.event_id, assetId: row.asset_id, revision: row.peer_revision }],
        text: `Event hypothesis ${row.event_id}; related photo ${row.asset_id} has direct ${row.field}: ${row.value_json}. Membership is evidence, not confirmation.`.slice(0, 180) }));
}
