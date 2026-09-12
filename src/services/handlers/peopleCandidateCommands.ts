import { applyStableManualFaceDecisionProjection } from '../faces/manualFaceSemanticRepository';
import { markPersonConfirmed, resolveCurrentPersonId } from '../faces/personLifecycleRepository';
import { getSemanticPredicateManifest } from '../relationships/predicates/registry';
import {
    ensureSemanticEntity,
    putSemanticProposition,
    recordSemanticDecision,
} from '../relationships/semanticRepository';
import type { CommandContext, CommandHandlerMap } from './types';

type CandidateActionPayload = {
    faceId: string;
    personId: string;
};

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
};

function loadReviewCandidates(ctx: CommandContext, requestedPersonId: string): CandidateAssignment[] {
    const db = ctx.dbManager.getDb();
    const personId = resolveCurrentPersonId(db, requestedPersonId);
    return db.prepare(`
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
            candidate.model_version
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
    `).all(personId) as CandidateAssignment[];
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
    recordSemanticDecision(db, {
        scopeKey,
        status,
        propositionId,
        sourceKind: 'human',
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
};