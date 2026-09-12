import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import { getSemanticPredicateManifest } from './predicates/registry';
import { addContributorAttestation, getContributor } from './contributorRepository';
import { ensureSemanticEntity, putSemanticProposition } from './semanticRepository';
import type { SemanticSubjectiveCertainty } from './semanticTypes';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type IdentityReviewResponseKind =
    | 'definite_identification'
    | 'tentative_identification'
    | 'possible_identification'
    | 'reject_candidate'
    | 'unsure_between_candidates'
    | 'unknown_no_clue'
    | 'recognise_cannot_name'
    | 'abstain';

type SinglePersonResponseKind =
    | 'definite_identification'
    | 'tentative_identification'
    | 'possible_identification'
    | 'reject_candidate';

export type RecordIdentityReviewResponseInput = {
    contributorId: string;
    faceId: string;
    kind: IdentityReviewResponseKind;
    personId?: string;
    candidatePersonIds?: string[];
    rawWording?: string | null;
};

export type RecordedIdentityReviewResponse = {
    responseId: string;
    propositionIds: string[];
    attestationIds: string[];
};

function assertContributorExists(db: DbHandle, contributorId: string): void {
    if (!getContributor(db, contributorId)) {
        throw new Error(`Contributor '${contributorId}' does not exist.`);
    }
}

function assertFaceExists(db: DbHandle, faceId: string): void {
    const row = db.prepare("SELECT id FROM semantic_entities WHERE id = ? AND kind = 'face'")
        .get(faceId);
    if (!row) {
        throw new Error(`Semantic Face '${faceId}' does not exist.`);
    }
}

function createDepictsProposition(db: DbHandle, faceId: string, personId: string): string {
    const person = db.prepare('SELECT name FROM people WHERE id = ?')
        .get(personId) as { name: string | null } | undefined;
    if (!person) {
        throw new Error(`Person '${personId}' does not exist.`);
    }
    const personEntityId = ensureSemanticEntity(db, {
        kind: 'person',
        nativeId: personId,
        label: person.name,
    });
    const predicate = getSemanticPredicateManifest('depicts');
    return putSemanticProposition(db, {
        scopeKey: `${faceId}:depicts`,
        subjectEntityId: faceId,
        predicate: predicate.key,
        object: { type: 'entity', entityId: personEntityId },
    });
}

function insertResponse(
    db: DbHandle,
    input: RecordIdentityReviewResponseInput,
): string {
    const responseId = uuidv4();
    db.prepare(`
        INSERT INTO review_responses (
            id, contributor_id, subject_entity_id, response_kind, raw_wording
        )
        VALUES (?, ?, ?, ?, ?)
    `).run(
        responseId,
        input.contributorId,
        input.faceId,
        input.kind,
        input.rawWording ?? null,
    );
    return responseId;
}

function linkResponseProposition(
    db: DbHandle,
    responseId: string,
    propositionId: string,
    relation: 'subject' | 'candidate' | 'abstained_from',
): void {
    db.prepare(`
        INSERT INTO review_response_propositions (response_id, proposition_id, relation)
        VALUES (?, ?, ?)
    `).run(responseId, propositionId, relation);
}

function certaintyFor(kind: SinglePersonResponseKind): SemanticSubjectiveCertainty {
    if (kind === 'tentative_identification') {
        return 'tentative';
    }
    if (kind === 'possible_identification') {
        return 'possible';
    }
    return 'definite';
}

function recordSinglePersonResponse(
    db: DbHandle,
    input: RecordIdentityReviewResponseInput & { kind: SinglePersonResponseKind; personId: string },
    responseId: string,
): RecordedIdentityReviewResponse {
    const propositionId = createDepictsProposition(db, input.faceId, input.personId);
    linkResponseProposition(db, responseId, propositionId, 'subject');
    const attestationId = addContributorAttestation(db, input.contributorId, {
        propositionId,
        stance: input.kind === 'reject_candidate' ? 'oppose' : 'support',
        sourceRef: `review-response:${responseId}`,
        subjectiveCertainty: certaintyFor(input.kind),
        rawWording: input.rawWording ?? null,
    });
    return { responseId, propositionIds: [propositionId], attestationIds: [attestationId] };
}

function recordAmbiguousCandidates(
    db: DbHandle,
    input: RecordIdentityReviewResponseInput,
    responseId: string,
): RecordedIdentityReviewResponse {
    const candidatePersonIds = [...new Set(input.candidatePersonIds ?? [])];
    if (candidatePersonIds.length < 2) {
        throw new Error('Unsure-between-candidates response requires at least two Person candidates.');
    }
    const propositionIds = candidatePersonIds.map((personId) => {
        const propositionId = createDepictsProposition(db, input.faceId, personId);
        linkResponseProposition(db, responseId, propositionId, 'candidate');
        return propositionId;
    });
    return { responseId, propositionIds, attestationIds: [] };
}

function recordAbstention(
    db: DbHandle,
    input: RecordIdentityReviewResponseInput,
    responseId: string,
): RecordedIdentityReviewResponse {
    if (!input.personId) {
        return { responseId, propositionIds: [], attestationIds: [] };
    }
    const propositionId = createDepictsProposition(db, input.faceId, input.personId);
    linkResponseProposition(db, responseId, propositionId, 'abstained_from');
    return { responseId, propositionIds: [propositionId], attestationIds: [] };
}

function isSinglePersonResponse(kind: IdentityReviewResponseKind): kind is SinglePersonResponseKind {
    return kind === 'definite_identification'
        || kind === 'tentative_identification'
        || kind === 'possible_identification'
        || kind === 'reject_candidate';
}

export function recordIdentityReviewResponse(
    db: DbHandle,
    input: RecordIdentityReviewResponseInput,
): RecordedIdentityReviewResponse {
    assertContributorExists(db, input.contributorId);
    assertFaceExists(db, input.faceId);

    return db.transaction(() => {
        const responseId = insertResponse(db, input);
        if (isSinglePersonResponse(input.kind)) {
            if (!input.personId) {
                throw new Error(`Review response '${input.kind}' requires a Person candidate.`);
            }
            return recordSinglePersonResponse(
                db,
                { ...input, kind: input.kind, personId: input.personId },
                responseId,
            );
        }
        if (input.kind === 'unsure_between_candidates') {
            return recordAmbiguousCandidates(db, input, responseId);
        }
        if (input.kind === 'abstain') {
            return recordAbstention(db, input, responseId);
        }
        return { responseId, propositionIds: [], attestationIds: [] };
    })();
}
