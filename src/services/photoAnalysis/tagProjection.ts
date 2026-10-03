import type { DatabaseManager } from '../../data/db';
import { TagRepository } from '../tags/tagRepository';
import { loadAnalysis } from './repository';

/** Project the winning tag claim into searchable vocabulary assignments. */
export function syncAnalysisTagAssignments(dbManager: DatabaseManager, assetId: string): void {
    const db = dbManager.getDb();
    const claim = loadAnalysis(dbManager, assetId).winners.find(item => item.field === 'tags' && item.subjectId === null);
    const repository = new TagRepository(dbManager);
    db.transaction(() => {
        db.prepare("DELETE FROM asset_tag_assignments WHERE asset_id = ? AND source_kind = 'analysis'").run(assetId);
        if (claim?.field !== 'tags') { return; }
        const seen = new Set<string>();
        for (const label of claim.value) {
            const normalized = label.trim().toLocaleLowerCase();
            if (!normalized || seen.has(normalized)) { continue; }
            seen.add(normalized);
            const definition = repository.findTagDefinitionByLabel(label);
            if (definition?.status === 'active') {
                repository.assignTagToAsset({ assetId, tagDefinitionId: definition.id,
                    sourceKind: 'analysis', sourceRecordId: claim.id });
            } else if (claim.kind !== 'user_confirmed') {
                queueTagProposal(dbManager, assetId, label.trim(), normalized, claim.id);
            }
        }
    })();
}

function queueTagProposal(dbManager: DatabaseManager, assetId: string, label: string, normalized: string, claimId: string): void {
    const db = dbManager.getDb();
    const existing = db.prepare(`SELECT id FROM review_items
        WHERE review_item_type = 'tag_proposal' AND subject_type = 'asset' AND subject_id = ?
            AND json_extract(payload_json, '$.normalizedLabel') = ? LIMIT 1`).get(assetId, normalized);
    if (existing) { return; }
    new TagRepository(dbManager).createReviewItem({ reviewItemType: 'tag_proposal', subjectType: 'asset', subjectId: assetId,
        payloadJson: JSON.stringify({ proposedLabel: label, normalizedLabel: normalized, analysisClaimId: claimId }) });
}
