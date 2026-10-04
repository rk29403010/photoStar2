import { randomUUID } from 'node:crypto';
import { win32 } from 'node:path';
import type { DatabaseManager } from '../../data/db';
import type { AnalysisSource, RefinementTarget } from '../../shared/photoAnalysis/contracts';
import type { StableAnalysisFace } from './geometry';
import type { CandidateIdentity } from './stageContracts';
import { buildFamilyIdentityContext } from '../relatedPhotos/identityContext';
import { retrieveRelatedEventContext } from '../relatedPhotos/context';

type Db = ReturnType<DatabaseManager['getDb']>;
type CandidateRow = {
    person_id: string; name: string | null; birth_date: string | null; death_date: string | null;
    raw_cosine: number | null; priority: number;
};
type ContextInput = {
    assetId: string; faces: StableAnalysisFace[]; targets: RefinementTarget[];
    sourcePrefix?: string; maxCandidates?: number; maxSources?: number;
};
type ContextState = {
    assetId: string; prefix: string; maxSources: number; sources: AnalysisSource[]; candidates: CandidateIdentity[];
    keys: Set<string>;
};

function boundedLimit(value: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
        throw new Error(`Context retrieval limit must be an integer from 1 to ${maximum}.`);
    }
    return value;
}

function addSource(state: ContextState, source: Omit<AnalysisSource, 'id' | 'assetId'>): string | null {
    const key = `${source.kind}:${source.refId}`;
    if (state.keys.has(key)) {
        return state.sources.find(item => item.kind === source.kind && item.refId === source.refId)!.id;
    }
    if (state.sources.length >= state.maxSources) { return null; }
    const id = `${state.prefix}:context:${state.sources.length + 1}`;
    state.sources.push({ ...source, text: source.text.slice(0, 180), id, assetId: state.assetId });
    state.keys.add(key);
    return id;
}

function addLocalSources(db: Db, state: ContextState): void {
    const row = db.prepare(`SELECT original_path, exif_datetime, metadata_timestamp_source
        FROM assets WHERE id = ?`).get(state.assetId) as {
        original_path: string; exif_datetime: string | null; metadata_timestamp_source: string | null;
    } | undefined;
    if (!row) { throw new Error('Context retrieval requires an existing asset.'); }
    addSource(state, { kind: 'local', refId: `${state.assetId}:filename`,
        text: `Filename/path evidence: ${win32.basename(row.original_path)}; ${row.original_path}` });
    if (row.exif_datetime) {
        addSource(state, { kind: 'local', refId: `${state.assetId}:exif_datetime`,
            text: `File EXIF timestamp: ${row.exif_datetime}; source: ${row.metadata_timestamp_source ?? 'EXIF'}. May date a scan/file capture rather than the photographed event.` });
    }
}

function validateFaceScope(db: Db, assetId: string, faceId: string): void {
    const row = db.prepare(`SELECT face.id FROM faces face
        JOIN visual_regions region ON region.id = face.visual_region_id
        JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid
        WHERE asset.id = ? AND face.id = ?`).get(assetId, faceId);
    if (!row) { throw new Error('Context Face ID must belong to the requested photo.'); }
}

function loadCandidates(db: Db, assetId: string, faceId: string, limit: number): CandidateRow[] {
    return db.prepare(`WITH choices AS (
        SELECT person.id AS person_id, person.name, person.birth_date, person.death_date,
            NULL AS raw_cosine, -2 AS priority
        FROM analysis_claims claim JOIN people person ON person.id = json_extract(claim.value_json, '$.personId')
        WHERE claim.asset_id = ? AND claim.subject_id = ? AND claim.field = 'identity'
            AND claim.kind = 'user_confirmed' AND claim.state = 'active' AND person.lifecycle_status = 'confirmed'
        UNION ALL
        SELECT person.id, person.name, person.birth_date, person.death_date, NULL, -1
        FROM semantic_propositions proposition
        JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
        JOIN semantic_entities entity ON entity.id = proposition.object_entity_id AND entity.kind = 'person'
        JOIN people person ON person.id = entity.native_id
        WHERE proposition.subject_entity_id = ? AND proposition.predicate = 'depicts'
            AND decision.is_current = 1 AND decision.status = 'accepted' AND decision.source_kind = 'human'
            AND person.lifecycle_status = 'confirmed'
        UNION ALL
        SELECT person.id, person.name, person.birth_date, person.death_date, candidate.raw_cosine, candidate.rank
        FROM face_person_candidates candidate JOIN people person ON person.id = candidate.person_id
        WHERE candidate.face_id = ? AND person.lifecycle_status = 'confirmed'
            AND (candidate.decision_status IS NULL OR candidate.decision_status <> 'rejected')
            AND NOT EXISTS (
                SELECT 1 FROM semantic_propositions proposition
                JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
                JOIN semantic_entities entity ON entity.id = proposition.object_entity_id
                WHERE proposition.subject_entity_id = candidate.face_id AND proposition.predicate = 'depicts'
                    AND entity.kind = 'person' AND entity.native_id = candidate.person_id
                    AND decision.is_current = 1 AND decision.status = 'rejected'
            )
        ) SELECT person_id, name, birth_date, death_date, MAX(raw_cosine) AS raw_cosine, MIN(priority) AS priority
        FROM choices GROUP BY person_id ORDER BY priority, raw_cosine DESC, person_id LIMIT ?`)
        .all(assetId, faceId, faceId, faceId, limit) as CandidateRow[];
}

function addCandidateSources(db: Db, state: ContextState, face: StableAnalysisFace, limit: number, permitted: Set<string>): void {
    for (const candidate of loadCandidates(db, state.assetId, face.faceId, limit)) {
        if (!permitted.has(candidate.person_id)) { continue; }
        const label = candidate.name ?? candidate.person_id;
        const status = candidate.priority < 0 ? 'User-confirmed identity' :
            `Candidate, raw cosine ${candidate.raw_cosine?.toFixed(3) ?? 'unknown'} (not a probability)`;
        const sourceId = addSource(state, { kind: 'person', refId: `${face.faceId}:${candidate.person_id}`,
            text: `${face.modelFaceId}: ${label.slice(0, 30)}. ${status}. Person birth: ${candidate.birth_date ?? 'unknown'}; death: ${candidate.death_date ?? 'unknown'}; separate from observed appearance.` });
        if (sourceId) { state.candidates.push({ faceId: face.faceId, personId: candidate.person_id, sourceId, label }); }
    }
}

function addFaceContext(manager: DatabaseManager, state: ContextState, face: StableAnalysisFace, limit: number): void {
    validateFaceScope(manager.getDb(), state.assetId, face.faceId);
    const family = buildFamilyIdentityContext(manager, { assetId: state.assetId, faceId: face.faceId, limit: Math.min(limit, 10) });
    addCandidateSources(manager.getDb(), state, face, limit, new Set(family.map(candidate => candidate.personId)));
    for (const candidate of family) {
        const sourceId = addSource(state, { kind: 'person', refId: candidate.sourceId, text: candidate.text });
        if (!sourceId || state.candidates.filter(item => item.faceId === face.faceId).length >= limit) { continue; }
        if (state.candidates.some(item => item.faceId === face.faceId && item.personId === candidate.personId)) { continue; }
        state.candidates.push({ faceId: face.faceId, personId: candidate.personId, sourceId, label: candidate.label });
    }
}

function addPersonLinks(db: Db, state: ContextState, personId: string): void {
    const rows = db.prepare(`SELECT gedcom_tree_id, gedcom_person_id FROM people_gedcom_links
        WHERE person_id = ? ORDER BY gedcom_tree_id, gedcom_person_id LIMIT ?`)
        .all(personId, state.maxSources - state.sources.length) as { gedcom_tree_id: string; gedcom_person_id: string }[];
    for (const row of rows) {
        addSource(state, { kind: 'person', refId: `gedcom:${row.gedcom_tree_id}:${row.gedcom_person_id}`,
            text: `Person ${personId} is linked to family tree ${row.gedcom_tree_id}, record ${row.gedcom_person_id}. This link supplies record provenance, not a visually observed identity.` });
    }
}

function addRelationships(db: Db, state: ContextState, personId: string): void {
    const rows = db.prepare(`SELECT proposition.id, proposition.predicate,
        subject.native_id AS subject_id, subject.label AS subject_label,
        object.native_id AS object_id, object.label AS object_label
        FROM semantic_entities subject JOIN semantic_propositions proposition ON proposition.subject_entity_id = subject.id
        JOIN semantic_entities object ON object.id = proposition.object_entity_id
        JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
        WHERE subject.kind = 'person' AND object.kind = 'person'
            AND (subject.native_id = ? OR object.native_id = ?)
            AND decision.is_current = 1 AND decision.status = 'accepted' AND decision.source_kind = 'human'
        ORDER BY proposition.id LIMIT ?`).all(personId, personId, state.maxSources - state.sources.length) as {
            id: string; predicate: string; subject_id: string; subject_label: string | null;
            object_id: string; object_label: string | null;
        }[];
    for (const row of rows) {
        addSource(state, { kind: 'relationship', refId: row.id,
            text: `User-confirmed relationship: ${row.subject_label ?? row.subject_id} ${row.predicate} ${row.object_label ?? row.object_id}.` });
    }
}

function addConfirmedPhotoClaims(db: Db, state: ContextState, assetId: string, related: boolean): void {
    const rows = db.prepare(`SELECT id, field, value_json FROM analysis_claims
        WHERE asset_id = ? AND field IN ('date', 'location') AND subject_id IS NULL
            AND kind = 'user_confirmed' AND state = 'active'
        ORDER BY created_at DESC, id LIMIT ?`).all(assetId, state.maxSources - state.sources.length) as {
            id: string; field: string; value_json: string;
        }[];
    for (const row of rows) {
        addSource(state, { kind: related ? 'related_photo' : 'claim', refId: row.id,
            text: `${related ? `Related photo ${assetId}, with confirmed identity of a retrieved candidate` : 'This photo'} has user-confirmed ${row.field}: ${row.value_json}.` });
    }
}

function addRelatedPhotos(db: Db, state: ContextState, personId: string): void {
    const rows = db.prepare(`SELECT DISTINCT asset.id AS id FROM semantic_entities entity
        JOIN semantic_propositions proposition ON proposition.object_entity_id = entity.id AND proposition.predicate = 'depicts'
        JOIN semantic_decisions decision ON decision.proposition_id = proposition.id
        JOIN faces face ON face.id = proposition.subject_entity_id
        JOIN visual_regions region ON region.id = face.visual_region_id
        JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid
        WHERE entity.kind = 'person' AND entity.native_id = ? AND asset.id <> ?
            AND decision.is_current = 1 AND decision.status = 'accepted' AND decision.source_kind = 'human'
        UNION
        SELECT DISTINCT claim.asset_id FROM analysis_claims claim
        WHERE claim.field = 'identity' AND claim.kind = 'user_confirmed' AND claim.state = 'active'
            AND json_extract(claim.value_json, '$.personId') = ? AND claim.asset_id <> ?
        ORDER BY id LIMIT ?`).all(personId, state.assetId, personId, state.assetId,
            state.maxSources - state.sources.length) as { id: string }[];
    for (const row of rows) { addConfirmedPhotoClaims(db, state, row.id, true); }
}

/** Read-only, bounded context. Retrieved identities are candidates; only human decisions supply truth. */
export function retrieveAnalysisContext(dbManager: DatabaseManager, input: ContextInput): {
    sources: AnalysisSource[]; candidates: CandidateIdentity[];
} {
    const db = dbManager.getDb();
    const state: ContextState = {
        assetId: input.assetId, prefix: input.sourcePrefix ?? randomUUID(),
        maxSources: boundedLimit(input.maxSources ?? 24, 100), sources: [], candidates: [], keys: new Set(),
    };
    if (!state.assetId || !state.prefix) { throw new Error('Context retrieval requires asset and source IDs.'); }
    const maxCandidates = boundedLimit(input.maxCandidates ?? 5, 20);
    addLocalSources(db, state);
    addConfirmedPhotoClaims(db, state, input.assetId, false);
    const photoWide = input.targets.some(target => target.subjectId === null);
    const faces = input.faces.filter(face => photoWide || input.targets.some(target => target.subjectId === face.faceId));
    for (const face of faces) {
        addFaceContext(dbManager, state, face, maxCandidates);
    }
    for (const personId of new Set(state.candidates.map(candidate => candidate.personId))) {
        addPersonLinks(db, state, personId);
        addRelationships(db, state, personId);
        addRelatedPhotos(db, state, personId);
    }
    for (const source of retrieveRelatedEventContext(dbManager, input.assetId, state.prefix, state.maxSources - state.sources.length)) {
        addSource(state, source);
    }
    return { sources: state.sources, candidates: state.candidates };
}
