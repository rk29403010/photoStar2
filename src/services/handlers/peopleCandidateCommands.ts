import { applyStableManualFaceDecisionProjection } from '../faces/manualFaceSemanticRepository';
import { markPersonConfirmed, resolveCurrentPersonId } from '../faces/personLifecycleRepository';
import {
    ensureCurrentContributor,
    recordContributorDecision,
} from '../relationships/contributorRepository';
import { getSemanticPredicateManifest } from '../relationships/predicates/registry';
import {
    ensureSemanticEntity,
    putSemanticProposition,
} from '../relationships/semanticRepository';
import {
    recordIdentityReviewResponse,
    type IdentityReviewResponseKind,
} from '../relationships/reviewResponseRepository';
import type { CommandContext, CommandHandlerMap } from './types';

type CandidateActionPayload = {
    faceId: string;
    personId: string;
};

type CandidateReviewPayload = {
    faceId: string;
    personId?: string;
    candidatePersonIds?: string[];
    kind: IdentityReviewResponseKind;
    rawWording?: string;
};

const IDENTITY_REVIEW_RESPONSE_KINDS = new Set<IdentityReviewResponseKind>([
    'definite_identification',
    'tentative_identification',
    'possible_identification',
    'reject_candidate',
    'unsure_between_candidates',
    'unknown_no_clue',
    'recognise_cannot_name',
    'abstain',
]);

type CandidateAssignment = {
    asset_id: string;
    face_id: string;
    visual_region_id: string;
    confidence: number;
    is_suggested: 1;
    original_path: string;
    preview_path: string | null;
    candidate_rank: number;
    runner_up_score: number | null;
    winner_margin: number | null;
    model_key: string;
    model_version: string;
    candidate_people: Array<{ personId: string; name: string }>;
};

type CandidateAssignmentRow = Omit<CandidateAssignment, 'candidate_people'> & {
    candidate_people_json: string;
};

function loadReviewCandidates(ctx: CommandContext, requestedPersonId: string): CandidateAssignment[] {
    const db = ctx.dbManager.getDb();
    const personId = resolveCurrentPersonId(db, requestedPersonId);
    const rows = db.prepare(`
        SELECT
            asset.id AS asset_id,
            candidate.face_id,
            face.visual_region_id,
            candidate.raw_cosine AS confidence,
            1 AS is_suggested,
            asset.original_path,
            preview.path AS preview_path,
            candidate.rank AS candidate_rank,
            candidate.runner_up_score,
            candidate.winner_margin,
            candidate.model_key,
            candidate.model_version,
            (
                SELECT json_group_array(json_object(
                    'personId', related.person_id,
                    'name', COALESCE(candidate_person.name, 'Unknown')
                ))
                FROM face_person_candidates related
                JOIN people candidate_person ON candidate_person.id = related.person_id
                WHERE related.face_id = candidate.face_id
                  AND related.review_eligible = 1
            ) AS candidate_people_json
        FROM face_person_candidates candidate
        JOIN faces face ON face.id = candidate.face_id
        JOIN visual_regions region ON region.id = face.visual_region_id
        JOIN asset_identities identity ON identity.guid = region.asset_identity_guid
        JOIN assets asset ON asset.original_path = identity.original_path
        LEFT JOIN previews preview ON preview.asset_id = asset.id AND preview.size = 'thumbnail'
        WHERE candidate.person_id = ?
          AND candidate.review_eligible = 1
          AND candidate.decision_status IS NULL
        ORDER BY candidate.raw_cosine DESC, candidate.rank ASC, candidate.face_id ASC
    `).all(personId) as CandidateAssignmentRow[];
    return rows.map(({ candidate_people_json: candidatePeopleJson, ...assignment }) => ({
        ...assignment,
        candidate_people: JSON.parse(candidatePeopleJson) as CandidateAssignment['candidate_people'],
    }));
}

function recordCandidateDecision(
    ctx: CommandContext,
    input: CandidateActionPayload,
    personName: string | null,
    status: 'accepted' | 'rejected',
): void {
    const db = ctx.dbManager.getDb();
    const face = db.prepare('SELECT id FROM faces WHERE id = ?')
        .get(input.faceId) as { id: string } | undefined;
    if (!face) {
        throw new Error(`Stable Face '${input.faceId}' does not exist.`);
    }

    const personEntityId = ensureSemanticEntity(db, {
        kind: 'person',
        nativeId: input.personId,
        label: personName,
    });
    const predicate = getSemanticPredicateManifest('depicts');
    const scopeKey = `${input.faceId}:depicts`;
    const propositionId = putSemanticProposition(db, {
        scopeKey,
        subjectEntityId: input.faceId,
        predicate: predicate.key,
        object: { type: 'entity', entityId: personEntityId },
    });
    const contributor = ensureCurrentContributor(db);
    recordContributorDecision(db, contributor.id, {
        scopeKey,
        status,
        propositionId,
        sourceRef: `people.candidate.${status}`,
    });
}

function updateCandidateDecision(
    ctx: CommandContext,
    input: CandidateActionPayload,
    status: 'accepted' | 'rejected',
): void {
    const db = ctx.dbManager.getDb();
    const personId = resolveCurrentPersonId(db, input.personId);
    const person = db.prepare('SELECT name FROM people WHERE id = ?')
        .get(personId) as { name: string | null } | undefined;
    if (!person) {
        throw new Error(`Person '${personId}' does not exist.`);
    }

    db.transaction(() => {
        const contributor = ensureCurrentContributor(db);
        recordIdentityReviewResponse(db, {
            contributorId: contributor.id,
            faceId: input.faceId,
            kind: status === 'accepted' ? 'definite_identification' : 'reject_candidate',
            personId,
        });
        recordCandidateDecision(ctx, { faceId: input.faceId, personId }, person.name, status);
        if (status === 'accepted') {
            markPersonConfirmed(db, personId);
        }
        applyStableManualFaceDecisionProjection(db);
        db.prepare(`
            UPDATE face_person_candidates
            SET decision_status = ?, review_eligible = 0, auto_action_eligible = 0
            WHERE face_id = ? AND person_id = ?
        `).run(status, input.faceId, personId);
    })();
}

function recordUnresolvedCandidateResponse(ctx: CommandContext, input: CandidateReviewPayload): string {
    const db = ctx.dbManager.getDb();
    const personId = input.personId ? resolveCurrentPersonId(db, input.personId) : undefined;
    const candidatePersonIds = input.candidatePersonIds?.map((id) => resolveCurrentPersonId(db, id));
    return db.transaction(() => {
        const contributor = ensureCurrentContributor(db);
        const response = recordIdentityReviewResponse(db, {
            contributorId: contributor.id,
            faceId: input.faceId,
            kind: input.kind,
            personId,
            candidatePersonIds,
            rawWording: input.rawWording,
        });
        const reviewAllFaceCandidates = input.kind === 'unsure_between_candidates'
            || input.kind === 'unknown_no_clue'
            || input.kind === 'recognise_cannot_name'
            || input.kind === 'abstain';
        if (reviewAllFaceCandidates) {
            db.prepare(`
                UPDATE face_person_candidates
                SET review_eligible = 0, auto_action_eligible = 0
                WHERE face_id = ?
            `).run(input.faceId);
        } else if (personId) {
            db.prepare(`
                UPDATE face_person_candidates
                SET review_eligible = 0, auto_action_eligible = 0
                WHERE face_id = ? AND person_id = ?
            `).run(input.faceId, personId);
        }
        return response.responseId;
    })();
}

function runCandidateAction(
    ctx: CommandContext,
    status: 'accepted' | 'rejected',
    successMessage: string,
): void {
    const { id, payload, originWs, respond } = ctx;
    try {
        const { faceId, personId } = payload as CandidateActionPayload;
        if (!faceId || !personId) {
            throw new Error('A stable faceId and Person id are required.');
        }
        updateCandidateDecision(ctx, { faceId, personId }, status);
        respond(id, 'ok', { message: successMessage }, null, originWs);
    } catch (error) {
        respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
    }
}

export const peopleCandidateCommandHandlers: CommandHandlerMap = {
    get_person_face_candidates: (ctx) => {
        const { id, payload, originWs, respond } = ctx;
        try {
            const { personId } = payload as { personId: string };
            const assignments = loadReviewCandidates(ctx, personId);
            respond(id, 'ok', { assignments }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    confirm_face_person_candidate: (ctx) => {
        runCandidateAction(ctx, 'accepted', 'Face candidate confirmed');
    },

    reject_face_person_candidate: (ctx) => {
        runCandidateAction(ctx, 'rejected', 'Face candidate rejected');
    },

    record_face_identity_review_response: (ctx) => {
        const { id, payload, originWs, respond } = ctx;
        try {
            const input = payload as CandidateReviewPayload;
            if (!input.faceId || !IDENTITY_REVIEW_RESPONSE_KINDS.has(input.kind)) {
                throw new Error('A stable faceId and supported identity review response are required.');
            }
            if (input.kind === 'definite_identification' || input.kind === 'reject_candidate') {
                if (!input.personId) {
                    throw new Error(`Review response '${input.kind}' requires a Person candidate.`);
                }
                updateCandidateDecision(
                    ctx,
                    { faceId: input.faceId, personId: input.personId },
                    input.kind === 'definite_identification' ? 'accepted' : 'rejected',
                );
            } else {
                recordUnresolvedCandidateResponse(ctx, input);
            }
            respond(id, 'ok', { message: 'Identity review response saved' }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },
};
