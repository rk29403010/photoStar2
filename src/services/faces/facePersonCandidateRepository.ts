import type { DatabaseManager } from '../../data/db';
import { cosineSimilarity } from '../math-utils';
import { iterateActiveFeatureVectors, type ActiveFeatureVector } from '../machineAnalysis/featureVectorRetrieval';
import { resolveCurrentPersonId } from './personLifecycleRepository';

type DbHandle = ReturnType<DatabaseManager['getDb']>;
type CandidateDecisionStatus = 'accepted' | 'rejected' | null;

type GenerationSpace = {
    modelKey: string;
    modelVersion: string;
    preprocessingVersion: string;
    configHash: string;
};

type VectorEvidence = ActiveFeatureVector & GenerationSpace;

type TrustedAnchor = {
    personId: string;
    faceId: string;
    vector: VectorEvidence;
};

type ScoredPerson = {
    personId: string;
    anchorFaceId: string;
    anchorAnalysisGenerationId: string;
    rawCosine: number;
    decisionStatus: CandidateDecisionStatus;
};

export type FaceCandidatePolicy = {
    evidenceRetentionFloor: number;
    reviewThreshold: number;
    autoActionThreshold: number;
    minimumWinnerMargin: number;
    candidateCount: number;
};

export type FacePersonCandidateEvidence = {
    faceId: string;
    personId: string;
    sourceAnalysisGenerationId: string;
    anchorFaceId: string;
    anchorAnalysisGenerationId: string;
    rawCosine: number;
    rank: number;
    runnerUpScore: number | null;
    winnerMargin: number | null;
    modelKey: string;
    modelVersion: string;
    preprocessingVersion: string;
    configHash: string;
    decisionStatus: CandidateDecisionStatus;
    reviewEligible: boolean;
    autoActionEligible: boolean;
};

const DEFAULT_POLICY: FaceCandidatePolicy = {
    evidenceRetentionFloor: 0.35,
    reviewThreshold: 0.55,
    autoActionThreshold: 0.72,
    minimumWinnerMargin: 0.08,
    candidateCount: 5,
};

const SETTING_KEYS = {
    evidenceRetentionFloor: 'face_candidate_evidence_retention_floor',
    reviewThreshold: 'face_candidate_review_threshold',
    autoActionThreshold: 'face_candidate_auto_action_threshold',
    minimumWinnerMargin: 'face_candidate_minimum_winner_margin',
    candidateCount: 'face_candidate_count',
} as const;

function numericSetting(dbManager: DatabaseManager, key: string, fallback: number): number {
    const raw = dbManager.getSetting(key);
    if (raw === null || raw === undefined || raw.trim() === '') {
        return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Face candidate setting '${key}' must be finite.`);
    }
    return parsed;
}

export function getFaceCandidatePolicy(dbManager: DatabaseManager): FaceCandidatePolicy {
    const policy = {
        evidenceRetentionFloor: numericSetting(dbManager, SETTING_KEYS.evidenceRetentionFloor, DEFAULT_POLICY.evidenceRetentionFloor),
        reviewThreshold: numericSetting(dbManager, SETTING_KEYS.reviewThreshold, DEFAULT_POLICY.reviewThreshold),
        autoActionThreshold: numericSetting(dbManager, SETTING_KEYS.autoActionThreshold, DEFAULT_POLICY.autoActionThreshold),
        minimumWinnerMargin: numericSetting(dbManager, SETTING_KEYS.minimumWinnerMargin, DEFAULT_POLICY.minimumWinnerMargin),
        candidateCount: numericSetting(dbManager, SETTING_KEYS.candidateCount, DEFAULT_POLICY.candidateCount),
    };
    if (policy.evidenceRetentionFloor < -1 || policy.evidenceRetentionFloor > 1
        || policy.reviewThreshold < -1 || policy.reviewThreshold > 1
        || policy.autoActionThreshold < -1 || policy.autoActionThreshold > 1) {
        throw new Error('Face candidate score thresholds must be between -1 and 1.');
    }
    if (policy.evidenceRetentionFloor > policy.reviewThreshold
        || policy.reviewThreshold > policy.autoActionThreshold) {
        throw new Error('Face candidate thresholds must satisfy evidence <= review <= auto-action.');
    }
    if (policy.minimumWinnerMargin < 0 || policy.minimumWinnerMargin > 2) {
        throw new Error('Face candidate minimum winner margin must be between 0 and 2.');
    }
    if (!Number.isInteger(policy.candidateCount) || policy.candidateCount < 1 || policy.candidateCount > 50) {
        throw new Error('Face candidate count must be an integer between 1 and 50.');
    }
    return policy;
}

function loadGenerationSpace(db: DbHandle, generationId: string): GenerationSpace {
    const row = db.prepare(`
        SELECT model_key, model_version, preprocessing_version, config_hash
        FROM analysis_generations
        WHERE id = ?
    `).get(generationId) as {
        model_key: string;
        model_version: string;
        preprocessing_version: string;
        config_hash: string;
    } | undefined;
    if (!row) {
        throw new Error(`Analysis generation '${generationId}' does not exist.`);
    }
    return {
        modelKey: row.model_key,
        modelVersion: row.model_version,
        preprocessingVersion: row.preprocessing_version,
        configHash: row.config_hash,
    };
}

function spaceKey(vector: VectorEvidence): string {
    return [
        vector.dimensions,
        vector.normalization,
        vector.metric,
        vector.modelKey,
        vector.modelVersion,
        vector.preprocessingVersion,
        vector.configHash,
    ].join('\u0000');
}

function loadActiveVectors(db: DbHandle): Map<string, VectorEvidence> {
    const generationSpaces = new Map<string, GenerationSpace>();
    const vectors = new Map<string, VectorEvidence>();
    for (const vector of iterateActiveFeatureVectors(db, 'face_embedding')) {
        let generationSpace = generationSpaces.get(vector.analysisGenerationId);
        if (!generationSpace) {
            generationSpace = loadGenerationSpace(db, vector.analysisGenerationId);
            generationSpaces.set(vector.analysisGenerationId, generationSpace);
        }
        vectors.set(vector.subjectEntityId, { ...vector, ...generationSpace });
    }
    return vectors;
}

function decisionKey(faceId: string, personId: string): string {
    return `${faceId}\u0000${personId}`;
}

function loadCurrentDecisions(db: DbHandle): Map<string, Exclude<CandidateDecisionStatus, null>> {
    const rows = db.prepare(`
        SELECT proposition.subject_entity_id AS face_id,
               person.native_id AS person_id,
               decision.status
        FROM semantic_decisions decision
        JOIN semantic_propositions proposition ON proposition.id = decision.proposition_id
        JOIN semantic_entities person ON person.id = proposition.object_entity_id
        JOIN people native_person ON native_person.id = person.native_id
        WHERE decision.is_current = 1
          AND decision.status IN ('accepted', 'rejected')
          AND proposition.predicate = 'depicts'
          AND person.kind = 'person'
    `).all() as Array<{ face_id: string; person_id: string; status: 'accepted' | 'rejected' }>;
    const decisions = new Map<string, 'accepted' | 'rejected'>();
    for (const row of rows) {
        const currentPersonId = resolveCurrentPersonId(db, row.person_id);
        decisions.set(decisionKey(row.face_id, currentPersonId), row.status);
    }
    return decisions;
}

function loadTrustedAnchors(
    db: DbHandle,
    vectors: Map<string, VectorEvidence>,
    decisions: Map<string, 'accepted' | 'rejected'>,
): TrustedAnchor[] {
    const anchors: TrustedAnchor[] = [];
    for (const [key, status] of decisions.entries()) {
        if (status !== 'accepted') {
            continue;
        }
        const separator = key.indexOf('\u0000');
        const faceId = key.slice(0, separator);
        const personId = key.slice(separator + 1);
        const vector = vectors.get(faceId);
        if (vector) {
            anchors.push({ personId, faceId, vector });
        }
    }
    return anchors;
}

function scorePeopleForFace(
    source: VectorEvidence,
    anchors: TrustedAnchor[],
    decisions: Map<string, 'accepted' | 'rejected'>,
    policy: FaceCandidatePolicy,
): ScoredPerson[] {
    const bestByPerson = new Map<string, ScoredPerson>();
    const sourceSpace = spaceKey(source);
    for (const anchor of anchors) {
        if (spaceKey(anchor.vector) !== sourceSpace) {
            continue;
        }
        const rawCosine = cosineSimilarity(source.values, anchor.vector.values);
        if (!Number.isFinite(rawCosine)) {
            continue;
        }
        const decisionStatus = decisions.get(decisionKey(source.subjectEntityId, anchor.personId)) ?? null;
        if (rawCosine < policy.evidenceRetentionFloor && decisionStatus === null) {
            continue;
        }
        const current = bestByPerson.get(anchor.personId);
        if (!current || rawCosine > current.rawCosine
            || (rawCosine === current.rawCosine && anchor.faceId < current.anchorFaceId)) {
            bestByPerson.set(anchor.personId, {
                personId: anchor.personId,
                anchorFaceId: anchor.faceId,
                anchorAnalysisGenerationId: anchor.vector.analysisGenerationId,
                rawCosine,
                decisionStatus,
            });
        }
    }
    return Array.from(bestByPerson.values()).sort((left, right) =>
        right.rawCosine - left.rawCosine || left.personId.localeCompare(right.personId));
}

function buildEvidenceForFace(
    source: VectorEvidence,
    scoredPeople: ScoredPerson[],
    policy: FaceCandidatePolicy,
): FacePersonCandidateEvidence[] {
    const retained = scoredPeople.slice(0, policy.candidateCount);
    const runnerUpScore = scoredPeople[1]?.rawCosine ?? null;
    const winnerMargin = runnerUpScore === null || scoredPeople.length === 0
        ? null
        : Math.max(0, scoredPeople[0].rawCosine - runnerUpScore);
    return retained.map((candidate, index) => {
        const rank = index + 1;
        const hasExplicitDecision = candidate.decisionStatus !== null;
        return {
            faceId: source.subjectEntityId,
            personId: candidate.personId,
            sourceAnalysisGenerationId: source.analysisGenerationId,
            anchorFaceId: candidate.anchorFaceId,
            anchorAnalysisGenerationId: candidate.anchorAnalysisGenerationId,
            rawCosine: candidate.rawCosine,
            rank,
            runnerUpScore,
            winnerMargin,
            modelKey: source.modelKey,
            modelVersion: source.modelVersion,
            preprocessingVersion: source.preprocessingVersion,
            configHash: source.configHash,
            decisionStatus: candidate.decisionStatus,
            reviewEligible: !hasExplicitDecision && candidate.rawCosine >= policy.reviewThreshold,
            autoActionEligible: !hasExplicitDecision
                && rank === 1
                && candidate.rawCosine >= policy.autoActionThreshold
                && winnerMargin !== null
                && winnerMargin >= policy.minimumWinnerMargin,
        };
    });
}

export function replaceFacePersonCandidates(db: DbHandle, candidates: FacePersonCandidateEvidence[]): void {
    const insert = db.prepare(`
        INSERT INTO face_person_candidates (
            face_id, person_id, source_analysis_generation_id,
            anchor_face_id, anchor_analysis_generation_id,
            raw_cosine, rank, runner_up_score, winner_margin,
            model_key, model_version, preprocessing_version, config_hash,
            decision_status, review_eligible, auto_action_eligible
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
        db.prepare('DELETE FROM face_person_candidates').run();
        for (const candidate of candidates) {
            insert.run(
                candidate.faceId,
                candidate.personId,
                candidate.sourceAnalysisGenerationId,
                candidate.anchorFaceId,
                candidate.anchorAnalysisGenerationId,
                candidate.rawCosine,
                candidate.rank,
                candidate.runnerUpScore,
                candidate.winnerMargin,
                candidate.modelKey,
                candidate.modelVersion,
                candidate.preprocessingVersion,
                candidate.configHash,
                candidate.decisionStatus,
                candidate.reviewEligible ? 1 : 0,
                candidate.autoActionEligible ? 1 : 0,
            );
        }
    })();
}

export function rebuildFacePersonCandidates(dbManager: DatabaseManager): FacePersonCandidateEvidence[] {
    const db = dbManager.getDb();
    const policy = getFaceCandidatePolicy(dbManager);
    const vectors = loadActiveVectors(db);
    const decisions = loadCurrentDecisions(db);
    const anchors = loadTrustedAnchors(db, vectors, decisions);
    const candidates: FacePersonCandidateEvidence[] = [];
    for (const source of vectors.values()) {
        const scored = scorePeopleForFace(source, anchors, decisions, policy);
        candidates.push(...buildEvidenceForFace(source, scored, policy));
    }
    replaceFacePersonCandidates(db, candidates);
    return candidates;
}
