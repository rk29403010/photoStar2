import { randomUUID } from 'node:crypto';
import type { DatabaseManager } from '../../data/db';
import { queuePhotoEvidenceChange } from '../../data/relatedPhotoQueue';
import type { MembershipAssessment } from '../../shared/relatedPhotos';
import { assessPhotoLink, findRelatedPhotoCandidates } from './candidates';
import { indexPhotoFeatures } from './features';

export type PhotoEvent = { id: string; seedAssetId: string; state: 'proposed' | 'supported' | 'conflicted'; confidence: string; revision: number };
export type EventMember = { eventId: string; assetId: string; role: 'anchored' | 'strong' | 'possible' | 'conflicting'; confidence: MembershipAssessment['confidence']; state: 'active' | 'rejected' | 'withdrawn'; evidence: MembershipAssessment['evidence']; revision: number };
type Db = ReturnType<DatabaseManager['getDb']>;
export const MAX_EVENT_MEMBERS = 64;

export function loadEventMembers(manager: DatabaseManager, eventId: string): EventMember[] {
    const rows = manager.getDb().prepare(`SELECT event_id AS eventId, asset_id AS assetId, role, confidence,
        state, evidence_json AS evidence, revision FROM photo_event_members WHERE event_id = ? ORDER BY asset_id LIMIT ?`)
        .all(eventId, MAX_EVENT_MEMBERS) as Array<Omit<EventMember, 'evidence'> & { evidence: string }>;
    return rows.map(row => ({ ...row, evidence: JSON.parse(row.evidence) }));
}

function currentDecision(db: Db, eventId: string, assetId: string): 'confirmed' | 'rejected' | 'undecided' | undefined {
    const row = db.prepare(`SELECT disposition FROM photo_event_decisions WHERE event_id = ? AND asset_id = ?
        ORDER BY rowid DESC LIMIT 1`).get(eventId, assetId) as { disposition: 'confirmed' | 'rejected' | 'undecided' } | undefined;
    return row?.disposition;
}

function hasAnchor(db: Db, assetId: string): boolean {
    return Boolean(db.prepare(`SELECT 1 FROM photo_analysis_winners WHERE asset_id = ? AND field IN ('date','location')
        AND subject_id IS NULL AND kind IN ('known_fact','user_confirmed') AND value_json <> 'null' AND confidence = 'high' LIMIT 1`).get(assetId));
}

function memberRole(anchor: boolean, decision: string | undefined, link: MembershipAssessment | null): EventMember['role'] {
    if (decision === 'confirmed') { return anchor ? 'anchored' : 'strong'; }
    if (anchor && link?.role === 'strong') { return 'anchored'; }
    return link?.role ?? 'possible';
}

function preserveConflict(event: PhotoEvent, previous: EventMember['role'] | undefined, state: EventMember['state'], role: EventMember['role']): EventMember['role'] {
    return event.state === 'conflicted' && previous === 'conflicting' && state === 'active' && role !== 'possible'
        ? 'conflicting' : role;
}

function memberState(decision: string | undefined, present: boolean): EventMember['state'] {
    if (decision === 'rejected') { return 'rejected'; }
    return present ? 'active' : 'withdrawn';
}

function updateMember(manager: DatabaseManager, event: PhotoEvent, assetId: string, seedLink: MembershipAssessment | null): void {
    const db = manager.getDb();
    const decision = currentDecision(db, event.id, assetId);
    const link = assetId === event.seedAssetId ? seedLink : assessPhotoLink(manager, event.seedAssetId, assetId);
    const eligible = db.prepare('SELECT 1 FROM assets WHERE id = ? AND binned_at IS NULL').get(assetId);
    const present = Boolean(eligible) && (assetId === event.seedAssetId || link !== null || decision === 'confirmed');
    const state = memberState(decision, present);
    const confidence = decision === 'confirmed' ? 'high' : link?.confidence ?? 'unknown';
    const baseRole = memberRole(hasAnchor(db, assetId), decision, link);
    const previous = db.prepare('SELECT role FROM photo_event_members WHERE event_id = ? AND asset_id = ?')
        .get(event.id, assetId) as { role: EventMember['role'] } | undefined;
    const role = preserveConflict(event, previous?.role, state, baseRole);
    const evidence = JSON.stringify(link?.evidence ?? []);
    db.prepare(`INSERT INTO photo_event_members(event_id, asset_id, role, confidence, state, evidence_json, revision)
        VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(event_id, asset_id) DO UPDATE SET
        role = excluded.role, confidence = excluded.confidence, state = excluded.state, evidence_json = excluded.evidence_json,
        revision = photo_event_members.revision + 1
        WHERE photo_event_members.role <> excluded.role OR photo_event_members.confidence <> excluded.confidence
          OR photo_event_members.state <> excluded.state OR photo_event_members.evidence_json <> excluded.evidence_json`)
        .run(event.id, assetId, role, confidence, state, evidence);
}

function strongestSeedLink(manager: DatabaseManager, event: PhotoEvent, ids: Set<string>): MembershipAssessment | null {
    let strongest: MembershipAssessment | null = null;
    const eligible = manager.getDb().prepare('SELECT 1 FROM assets WHERE id = ? AND binned_at IS NULL');
    for (const id of ids) {
        if (id === event.seedAssetId || currentDecision(manager.getDb(), event.id, id) === 'rejected') { continue; }
        if (!eligible.get(id)) { continue; }
        const link = assessPhotoLink(manager, event.seedAssetId, id);
        if (link?.role !== 'strong') { continue; }
        if (!strongest || link.confidence === 'high') { strongest = link; }
    }
    return strongest;
}

function resolveEvent(db: Db, assetId: string, candidates: string[]): PhotoEvent | null {
    const own = db.prepare(`SELECT id, seed_asset_id AS seedAssetId, state, confidence, revision FROM photo_events WHERE seed_asset_id = ?`).get(assetId) as PhotoEvent | undefined;
    if (own) { return own; }
    for (const id of [assetId, ...candidates]) {
        const event = db.prepare(`SELECT event.id, event.seed_asset_id AS seedAssetId, event.state, event.confidence, event.revision
            FROM photo_event_members member JOIN photo_events event ON event.id = member.event_id
            WHERE member.asset_id = ? AND member.state = 'active' AND member.role IN ('anchored','strong','conflicting')
              AND (EXISTS (SELECT 1 FROM photo_event_members own WHERE own.event_id = event.id AND own.asset_id = ?)
                OR (SELECT COUNT(*) FROM photo_event_members existing WHERE existing.event_id = event.id) < ?)
            ORDER BY event.created_at, event.id LIMIT 1`).get(id, assetId, MAX_EVENT_MEMBERS) as PhotoEvent | undefined;
        if (event) { return event; }
    }
    if (candidates.length === 0) { return null; }
    const now = new Date().toISOString();
    const event: PhotoEvent = { id: randomUUID(), seedAssetId: assetId, state: 'proposed', confidence: 'low', revision: 1 };
    db.prepare('INSERT INTO photo_events(id, seed_asset_id, state, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(event.id, assetId, event.state, event.confidence, now, now);
    return event;
}

function restoreMemberFeatureIndexes(manager: DatabaseManager, assetIds: string[]): void {
    const indexed = manager.getDb().prepare('SELECT 1 FROM related_photo_features WHERE asset_id = ? LIMIT 1');
    for (const id of assetIds) {
        if (!indexed.get(id)) { indexPhotoFeatures(manager, id); }
    }
}

/** One indexed seed neighbourhood, never transitive flood-fill or duplicate membership. */
export function reconsiderEventMembership(manager: DatabaseManager, assetId: string): PhotoEvent | null {
    indexPhotoFeatures(manager, assetId);
    const candidates = findRelatedPhotoCandidates(manager, assetId);
    return manager.getDb().transaction(() => {
        const event = resolveEvent(manager.getDb(), assetId, candidates);
        if (!event) { return null; }
        const current = loadEventMembers(manager, event.id).map(member => member.assetId);
        if (event.seedAssetId !== assetId) { indexPhotoFeatures(manager, event.seedAssetId); }
        restoreMemberFeatureIndexes(manager, current);
        const nearby = findRelatedPhotoCandidates(manager, event.seedAssetId);
        const ids = new Set(current);
        for (const id of [event.seedAssetId, assetId, ...nearby]) {
            if (ids.size >= MAX_EVENT_MEMBERS) { break; }
            ids.add(id);
        }
        const seedLink = strongestSeedLink(manager, event, ids);
        for (const id of ids) { updateMember(manager, event, id, seedLink); }
        return event;
    })();
}

/** Human membership judgement is durable evidence, not a gallery grouping preference. */
export function recordEventMembershipDecision(manager: DatabaseManager, input: {
    eventId: string; assetId: string; disposition: 'confirmed' | 'rejected' | 'undecided'; userId: string; note?: string;
}): void {
    if (!input.userId?.trim()) { throw new Error('Event membership requires user attribution'); }
    if (!['confirmed', 'rejected', 'undecided'].includes(input.disposition)) { throw new Error('Unknown membership disposition'); }
    manager.getDb().transaction(() => {
        const db = manager.getDb();
        db.prepare('INSERT INTO photo_event_decisions(id, event_id, asset_id, disposition, user_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(randomUUID(), input.eventId, input.assetId, input.disposition, input.userId, input.note ?? null, new Date().toISOString());
        db.prepare(`UPDATE photo_event_members SET state = ?, revision = revision + 1 WHERE event_id = ? AND asset_id = ?`)
            .run(input.disposition === 'rejected' ? 'rejected' : 'active', input.eventId, input.assetId);
        const members = loadEventMembers(manager, input.eventId);
        for (const member of members) { queuePhotoEvidenceChange(db, member.assetId, 'event-membership'); }
    })();
}
