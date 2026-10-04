import type { DatabaseManager } from '../../data/db';
import { loadEventMembers, type EventMember, type PhotoEvent } from './events';
import { assessPhotoLink } from './candidates';

type IdentityRoot = { id: string; personId: string; assetId: string };
type Db = ReturnType<DatabaseManager['getDb']>;

function identityRoots(db: Db, assetId: string): IdentityRoot[] {
    return db.prepare(`SELECT id, json_extract(value_json, '$.personId') AS personId, asset_id AS assetId
        FROM analysis_claims WHERE asset_id = ? AND field = 'identity' AND state = 'active' AND kind = 'user_confirmed'
          AND json_extract(value_json, '$.personId') IN (SELECT id FROM people WHERE lifecycle_status = 'confirmed')
        UNION ALL SELECT decision.id, entity.native_id, asset.id FROM assets asset
        JOIN visual_regions region ON region.asset_identity_guid = asset.asset_identity_guid
        JOIN faces face ON face.visual_region_id = region.id
        JOIN semantic_propositions proposition ON proposition.subject_entity_id = face.id AND proposition.predicate = 'depicts'
        JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
        JOIN semantic_entities entity ON entity.id = proposition.object_entity_id AND entity.kind = 'person'
        WHERE asset.id = ? AND decision.is_current = 1 AND decision.status = 'accepted' AND decision.source_kind = 'human'
          AND entity.native_id IN (SELECT id FROM people WHERE lifecycle_status = 'confirmed')
        LIMIT 40`).all(assetId, assetId) as IdentityRoot[];
}

function eligibleFaces(db: Db, assetId: string, personId: string): string[] {
    return (db.prepare(`SELECT candidate.face_id FROM face_person_candidates candidate
        JOIN faces face ON face.id = candidate.face_id JOIN visual_regions region ON region.id = face.visual_region_id
        JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid
        WHERE asset.id = ? AND candidate.person_id = ? AND candidate.decision_status IS NOT 'rejected'
          AND NOT EXISTS (SELECT 1 FROM semantic_propositions proposition
            JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
            WHERE proposition.subject_entity_id = face.id AND proposition.predicate = 'depicts'
              AND decision.is_current = 1 AND decision.status IN ('accepted','rejected'))
          AND NOT EXISTS (SELECT 1 FROM analysis_claims claim WHERE claim.asset_id = asset.id
            AND claim.field = 'identity' AND claim.subject_id = face.id AND claim.kind = 'user_confirmed' AND claim.state = 'active')
        ORDER BY candidate.rank, candidate.face_id LIMIT 20`).all(assetId, personId) as { face_id: string }[]).map(row => row.face_id);
}

/** Corroborates existing vector candidates; never writes an identity decision or a new cosine. */
export function strengthenEventIdentityCandidates(manager: DatabaseManager, event: PhotoEvent): void {
    manager.getDb().transaction(() => replaceEventIdentityCandidates(manager, event))();
}

function replaceEventIdentityCandidates(manager: DatabaseManager, event: PhotoEvent): void {
    const db = manager.getDb();
    const members = loadEventMembers(manager, event.id).filter(member => member.state === 'active'
        && member.role !== 'possible' && member.role !== 'conflicting');
    db.prepare('DELETE FROM related_face_candidates WHERE event_id = ?').run(event.id);
    const memberByAsset = new Map(members.map(member => [member.assetId, member]));
    for (const target of members) {
        for (const [personId, evidence] of collectTargetIdentityRoots(manager, target, members)) {
            insertCandidateGroup(db, { event, target, personId, evidence, memberByAsset });
        }
    }
}

function collectTargetIdentityRoots(manager: DatabaseManager, target: EventMember, members: EventMember[]): Map<string, IdentityRoot[]> {
    const roots = new Map<string, IdentityRoot[]>();
    for (const peer of members) {
        if (peer.assetId === target.assetId || assessPhotoLink(manager, target.assetId, peer.assetId)?.role !== 'strong') { continue; }
        for (const root of identityRoots(manager.getDb(), peer.assetId)) { addIdentityRoot(roots, root); }
    }
    return roots;
}

function addIdentityRoot(roots: Map<string, IdentityRoot[]>, root: IdentityRoot): void {
    const group = roots.get(root.personId) ?? [];
    if (!group.some(item => item.id === root.id)) { group.push(root); }
    roots.set(root.personId, group);
}

function sourceMembershipSnapshots(evidence: IdentityRoot[], memberByAsset: Map<string, EventMember>) {
    return [...new Set(evidence.map(root => root.assetId))].map(assetId => {
        const member = memberByAsset.get(assetId);
        if (!member) { throw new Error('Identity candidate evidence requires a current event member'); }
        return { assetId, revision: member.revision };
    });
}

function insertCandidateGroup(db: Db, input: {
    event: PhotoEvent; target: EventMember; personId: string; evidence: IdentityRoot[]; memberByAsset: Map<string, EventMember>;
}): void {
    const evidenceJson = JSON.stringify({
        text: 'Confirmed identity in a directly linked event photograph supports this existing face candidate; requires review.',
        sources: sourceMembershipSnapshots(input.evidence, input.memberByAsset), targetRevision: input.target.revision });
    const rootsJson = JSON.stringify(input.evidence.map(root => root.id));
    const insert = db.prepare(`INSERT INTO related_face_candidates(face_id, person_id, event_id, confidence, evidence_json, root_claim_ids_json)
        VALUES (?, ?, ?, 'medium', ?, ?)`);
    for (const faceId of eligibleFaces(db, input.target.assetId, input.personId)) {
        insert.run(faceId, input.personId, input.event.id, evidenceJson, rootsJson);
    }
}
