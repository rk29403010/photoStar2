import type { DatabaseManager } from '../../data/db';
import { parseGedcom } from '../gedcom/gedcomParser';
import type { GedcomData, Person } from '../gedcom/kinshipTypes';

type Db = ReturnType<DatabaseManager['getDb']>;
type PersonCandidate = { personId: string; label: string; birth: string | null; death: string | null; confirmed: number; relatedTo?: string };
type FamilyLink = { treeId: string; recordId: string; content: string };
type DateAge = { start: number; end: number; min: number; max: number };
type TreeCache = Map<string, { data: GedcomData; residences: Map<string, string[]> }>;
export type FamilyIdentityContext = { personId: string; label: string; sourceId: string; text: string };

const AFFECTED_PERSON_PHOTOS_SQL = `
            SELECT asset.id AS asset_id FROM face_person_candidates candidate
            JOIN faces face ON face.id = candidate.face_id
            JOIN visual_regions region ON region.id = face.visual_region_id
            JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid
            WHERE candidate.person_id = ?
            UNION
            SELECT asset.id FROM related_face_candidates candidate
            JOIN faces face ON face.id = candidate.face_id
            JOIN visual_regions region ON region.id = face.visual_region_id
            JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid WHERE candidate.person_id = ?
            UNION
            SELECT asset.id FROM semantic_propositions proposition
            JOIN semantic_entities entity ON entity.id = proposition.object_entity_id AND entity.kind = 'person'
            JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
            JOIN faces face ON face.id = proposition.subject_entity_id
            JOIN visual_regions region ON region.id = face.visual_region_id
            JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid
            WHERE entity.native_id = ? AND proposition.predicate = 'depicts' AND decision.is_current = 1
            UNION
            SELECT claim.asset_id FROM analysis_claims claim JOIN assets asset ON asset.id = claim.asset_id
            WHERE claim.field = 'identity' AND claim.state = 'active' AND json_extract(claim.value_json, '$.personId') = ?
`;

const STALE_PERSON_CLAIMS_SQL = `SELECT claim.id FROM analysis_claims claim
    JOIN analysis_claim_sources reference ON reference.claim_id = claim.id
    JOIN analysis_sources source ON source.id = reference.source_id
    WHERE claim.state = 'active' AND claim.kind NOT IN ('known_fact','user_confirmed')
        AND claim.field NOT IN ('appearance','link_features') AND source.state = 'withdrawn'
        AND source.kind IN ('person','relationship') AND claim.asset_id IN (${AFFECTED_PERSON_PHOTOS_SQL})`;

/** Withdraw stale contextual claims immediately and durably queue only affected photos. */
export function queuePersonPhotoReconsideration(manager: Pick<DatabaseManager, 'getDb'>, personId: string, cause: string): number {
    if (!personId.trim() || !cause.trim()) { throw new Error('Person and reconsideration cause are required.'); }
    const db = manager.getDb();
    const bindings = [personId, personId, personId, personId];
    return db.transaction(() => {
        db.prepare(`UPDATE analysis_sources SET state = 'withdrawn'
            WHERE state = 'active' AND kind IN ('person','relationship')
                AND asset_id IN (${AFFECTED_PERSON_PHOTOS_SQL})`).run(...bindings);
        db.prepare(`INSERT INTO related_photo_queue(asset_id, cause, revision, status, attempts, error, updated_at)
            SELECT DISTINCT claim.asset_id, ?, 1, 'pending', 0, NULL, CURRENT_TIMESTAMP
            FROM analysis_claim_roots dependency JOIN analysis_claims claim ON claim.id = dependency.claim_id
            WHERE claim.state = 'active' AND dependency.root_claim_id IN (${STALE_PERSON_CLAIMS_SQL})
            ON CONFLICT(asset_id) DO UPDATE SET cause = excluded.cause, revision = related_photo_queue.revision + 1,
                status = 'pending', attempts = 0, error = NULL, updated_at = CURRENT_TIMESTAMP`)
            .run(cause, ...bindings);
        const queued = db.prepare(`INSERT INTO related_photo_queue (asset_id, cause, revision, status, attempts, error, updated_at)
            SELECT affected.asset_id, ?, 1, 'pending', 0, NULL, CURRENT_TIMESTAMP FROM (
                ${AFFECTED_PERSON_PHOTOS_SQL}) affected WHERE 1
            ON CONFLICT(asset_id) DO UPDATE SET cause = excluded.cause, revision = related_photo_queue.revision + 1,
                status = 'pending', attempts = 0, error = NULL, updated_at = CURRENT_TIMESTAMP
        `).run(cause, ...bindings).changes;
        // Queue before supersession: an inferred identity may itself be the only affected-person link.
        db.prepare(`UPDATE analysis_claims SET state = 'superseded' WHERE id IN (${STALE_PERSON_CLAIMS_SQL})`)
            .run(...bindings);
        return queued;
    })();
}

function isRejected(db: Db, faceId: string, personId: string): boolean {
    return Boolean(db.prepare(`SELECT 1 FROM semantic_propositions proposition
        JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
        JOIN semantic_entities entity ON entity.id = proposition.object_entity_id AND entity.kind = 'person'
        WHERE proposition.subject_entity_id = ? AND proposition.predicate = 'depicts' AND entity.native_id = ?
            AND decision.is_current = 1 AND decision.status = 'rejected' AND decision.source_kind != 'machine'
        UNION SELECT 1 FROM face_person_candidates WHERE face_id = ? AND person_id = ? AND decision_status = 'rejected'
        LIMIT 1`).get(faceId, personId, faceId, personId));
}

function loadSeeds(db: Db, assetId: string, faceId: string, limit: number): PersonCandidate[] {
    return db.prepare(`WITH choices AS (
        SELECT entity.native_id AS person_id, 1 AS confirmed, 0 AS priority FROM semantic_propositions proposition
        JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
        JOIN semantic_entities entity ON entity.id = proposition.object_entity_id AND entity.kind = 'person'
        WHERE proposition.subject_entity_id = ? AND proposition.predicate = 'depicts' AND decision.is_current = 1
            AND decision.status = 'accepted' AND decision.source_kind != 'machine'
        UNION ALL SELECT json_extract(value_json, '$.personId'), 1, 0 FROM analysis_claims
        WHERE asset_id = ? AND subject_id = ? AND field = 'identity' AND state = 'active' AND kind = 'user_confirmed'
        UNION ALL SELECT person_id, 0, rank FROM face_person_candidates WHERE face_id = ? AND decision_status IS NOT 'rejected'
        UNION ALL SELECT candidate.person_id, 0, 6 FROM related_face_candidates candidate
        JOIN photo_event_members member ON member.event_id = candidate.event_id AND member.asset_id = ?
        WHERE candidate.face_id = ? AND member.state = 'active' AND member.role IN ('strong','anchored')
            AND json_extract(candidate.evidence_json, '$.targetRevision') = member.revision
            AND json_array_length(candidate.evidence_json, '$.sources') > 0
            AND NOT EXISTS (SELECT 1 FROM json_each(candidate.evidence_json, '$.sources') source
                WHERE NOT EXISTS (SELECT 1 FROM photo_event_members support
                    WHERE support.event_id = candidate.event_id AND support.asset_id = json_extract(source.value, '$.assetId')
                        AND support.revision = json_extract(source.value, '$.revision') AND support.state = 'active'
                        AND support.role IN ('strong','anchored')))
            AND json_array_length(candidate.root_claim_ids_json) > 0
            AND NOT EXISTS (SELECT 1 FROM json_each(candidate.root_claim_ids_json) root
                WHERE NOT EXISTS (SELECT 1 FROM analysis_claims claim WHERE claim.id = root.value
                    AND claim.state = 'active' AND claim.kind = 'user_confirmed' AND claim.field = 'identity'
                    AND json_extract(claim.value_json, '$.personId') = candidate.person_id)
                AND NOT EXISTS (SELECT 1 FROM semantic_decisions decision
                    JOIN semantic_propositions proposition ON proposition.id = decision.proposition_id AND proposition.predicate = 'depicts'
                    JOIN semantic_entities entity ON entity.id = proposition.object_entity_id AND entity.kind = 'person'
                    WHERE decision.id = root.value AND decision.is_current = 1 AND decision.status = 'accepted'
                        AND decision.source_kind = 'human' AND entity.native_id = candidate.person_id))
    ) SELECT person.id AS personId, person.name AS label, person.birth_date AS birth, person.death_date AS death,
        MAX(choices.confirmed) AS confirmed FROM choices JOIN people person ON person.id = choices.person_id
        WHERE person.lifecycle_status = 'confirmed' AND NOT EXISTS (
            SELECT 1 FROM semantic_propositions proposition
            JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
            JOIN semantic_entities entity ON entity.id = proposition.object_entity_id AND entity.kind = 'person'
            WHERE proposition.subject_entity_id = ? AND proposition.predicate = 'depicts' AND entity.native_id = person.id
                AND decision.is_current = 1 AND decision.status = 'rejected' AND decision.source_kind != 'machine'
        ) GROUP BY person.id ORDER BY confirmed DESC, MIN(priority), person.id LIMIT ?`)
        .all(faceId, assetId, faceId, faceId, assetId, faceId, faceId, limit) as PersonCandidate[];
}

function loadLinks(db: Db, personId: string): FamilyLink[] {
    return db.prepare(`SELECT link.gedcom_tree_id AS treeId, link.gedcom_person_id AS recordId, tree.gedcom_content AS content
        FROM people_gedcom_links link JOIN family_trees tree ON tree.id = link.gedcom_tree_id
        WHERE link.person_id = ? ORDER BY link.gedcom_tree_id, link.gedcom_person_id LIMIT 3`).all(personId) as FamilyLink[];
}

function parsedTree(cache: TreeCache, link: FamilyLink): GedcomData {
    let entry = cache.get(link.treeId);
    if (!entry) {
        entry = { data: parseGedcom(link.content), residences: parseResidences(link.content) };
        cache.set(link.treeId, entry);
    }
    return entry.data;
}

function year(value: string | null | undefined): number | null {
    if (!value) { return null; }
    const match = /^(?:\d{1,2} [A-Z]{3} )?(\d{4})(?:-\d{2}-\d{2})?$/u.exec(value.trim());
    return match ? Number(match[1]) : null;
}

function loadDateAge(db: Db, assetId: string, faceId: string): DateAge | null {
    const age = db.prepare(`SELECT json_extract(value_json, '$.apparentAge.min') AS min,
        json_extract(value_json, '$.apparentAge.max') AS max FROM analysis_claims
        WHERE asset_id = ? AND subject_id = ? AND field = 'appearance' AND kind = 'observation' AND state = 'active'
        ORDER BY rowid DESC LIMIT 1`).get(assetId, faceId) as { min: number | null; max: number | null } | undefined;
    const date = db.prepare(`SELECT json_extract(value_json, '$.start') AS start, json_extract(value_json, '$.end') AS end
        FROM photo_analysis_winners WHERE asset_id = ? AND field = 'date' AND subject_id IS NULL LIMIT 1`)
        .get(assetId) as { start: string | null; end: string | null } | undefined;
    const start = year(date?.start); const end = year(date?.end);
    if (!age || age.min === null || age.max === null || start === null || end === null) { return null; }
    return { start, end, min: age.min, max: age.max };
}

function ageCompatible(context: DateAge | null, birthDate: string | null | undefined, deathDate: string | null | undefined): boolean {
    if (!context) { return true; }
    const birth = year(birthDate); const death = year(deathDate);
    if (death !== null && death < context.start) { return false; }
    if (birth === null) { return true; }
    return context.end - birth >= context.min && context.start - birth - 1 <= context.max;
}

function familyRecords(data: GedcomData, person: Person): string[] {
    const families = [person.famc, ...person.fams].filter((id): id is string => Boolean(id));
    return [...new Set(families.flatMap(id => {
        const family = data.families[id];
        return family ? [family.husb, family.wife, ...family.children].filter((record): record is string => Boolean(record)) : [];
    }))].filter(id => id !== person.id).slice(0, 10);
}

function parseResidences(content: string): Map<string, string[]> {
    const lines = content.split(/\r?\n/u);
    const records = new Map<string, string[]>();
    let recordId: string | undefined; let inResidence = false;
    for (const line of lines) {
        if (line.startsWith('0 ')) { recordId = /^0 (@\w+@) INDI/u.exec(line)?.[1]; inResidence = false; }
        if (!recordId) { continue; }
        if (line.startsWith('1 ')) { inResidence = line.startsWith('1 RESI'); }
        if (!inResidence || !/^2 (?:DATE|PLAC) /u.test(line)) { continue; }
        const facts = records.get(recordId) ?? [];
        if (facts.length < 4) { facts.push(line.slice(2).trim()); records.set(recordId, facts); }
    }
    return records;
}

function mappedRelatives(db: Db, link: FamilyLink, data: GedcomData, person: Person): PersonCandidate[] {
    const result: PersonCandidate[] = [];
    for (const recordId of familyRecords(data, person)) {
        const mapped = db.prepare(`SELECT person.id AS personId, person.name AS label, person.birth_date AS birth,
            person.death_date AS death, 0 AS confirmed FROM people_gedcom_links link
            JOIN people person ON person.id = link.person_id WHERE link.gedcom_tree_id = ? AND link.gedcom_person_id = ?
                AND person.lifecycle_status = 'confirmed' ORDER BY person.id LIMIT 2`).all(link.treeId, recordId) as PersonCandidate[];
        const record = data.people[recordId];
        for (const candidate of mapped) {
            result.push({ ...candidate, birth: record?.birthDate ?? candidate.birth,
                death: record?.deathDate ?? candidate.death, relatedTo: person.name });
        }
    }
    return result;
}

function candidateFacts(db: Db, candidate: PersonCandidate, cache: TreeCache) {
    const links = loadLinks(db, candidate.personId);
    const records = links.map(link => ({ link, person: parsedTree(cache, link).people[link.recordId] }));
    const birth = records.find(record => record.person?.birthDate)?.person?.birthDate ?? candidate.birth;
    const death = records.find(record => record.person?.deathDate)?.person?.deathDate ?? candidate.death;
    const origin = records[0]?.link;
    const sourceId = origin ? `gedcom:${origin.treeId}:${origin.recordId}` : `person:${candidate.personId}`;
    const places = records.map(record => (cache.get(record.link.treeId)?.residences.get(record.link.recordId) ?? [])
        .join('; ')).filter(Boolean).join('; ').slice(0, 140);
    return { birth, death, sourceId, places };
}

function describeCandidate(db: Db, candidate: PersonCandidate, context: DateAge | null, cache: TreeCache): FamilyIdentityContext | null {
    const { birth, death, sourceId, places } = candidateFacts(db, candidate, cache);
    const compatible = ageCompatible(context, birth, death);
    if (!candidate.confirmed && !compatible) { return null; }
    const status = candidate.confirmed ? 'Human-confirmed identity' : 'Candidate, requires review';
    const relationship = candidate.relatedTo ? `Family of ${candidate.relatedTo.slice(0, 25)}. ` : '';
    const conflict = compatible ? '' : 'Visual age/date contradiction. ';
    return { personId: candidate.personId, label: candidate.label, sourceId,
        text: `${status}: ${candidate.label.slice(0, 30)}. ${conflict}Birth ${birth ?? 'unknown'}; death ${death ?? 'unknown'}. ${relationship}${places ? `Residence ${places}.` : ''}`.slice(0, 180) };
}

function expandFamilyCandidates(db: Db, seeds: PersonCandidate[], cache: TreeCache): PersonCandidate[] {
    const candidates = new Map(seeds.map(candidate => [candidate.personId, candidate]));
    for (const seed of seeds) {
        for (const link of loadLinks(db, seed.personId)) {
            const data = parsedTree(cache, link); const person = data.people[link.recordId];
            if (!person) { continue; }
            for (const candidate of mappedRelatives(db, link, data, person)) {
                if (!candidates.has(candidate.personId)) { candidates.set(candidate.personId, candidate); }
            }
        }
    }
    return [...candidates.values()];
}

/** Retrieves linked records and immediate mapped relatives; never manufactures a Person from tree text. */
export function buildFamilyIdentityContext(manager: DatabaseManager, input: { assetId: string; faceId: string; limit?: number }): FamilyIdentityContext[] {
    const limit = input.limit ?? 5;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) { throw new Error('Identity context limit must be 1..10.'); }
    const db = manager.getDb();
    const scoped = db.prepare(`SELECT 1 FROM faces face JOIN visual_regions region ON region.id = face.visual_region_id
        JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid WHERE asset.id = ? AND face.id = ?`)
        .get(input.assetId, input.faceId);
    if (!scoped) { throw new Error('Identity context Face ID must belong to the photo.'); }
    const cache: TreeCache = new Map();
    const context = loadDateAge(db, input.assetId, input.faceId);
    return expandFamilyCandidates(db, loadSeeds(db, input.assetId, input.faceId, limit), cache)
        .filter(candidate => !isRejected(db, input.faceId, candidate.personId))
        .map(candidate => describeCandidate(db, candidate, context, cache))
        .filter((item): item is FamilyIdentityContext => item !== null).slice(0, limit);
}
