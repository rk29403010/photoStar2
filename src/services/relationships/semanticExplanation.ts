import type Database from 'better-sqlite3';
import { resolveSemanticScope } from './semanticRepository';
import type {
    JsonValue,
    SemanticAttestationStance,
    SemanticDecisionStatus,
    SemanticEntityKind,
    SemanticEvidenceRef,
    SemanticResolution,
    SemanticSourceKind,
} from './semanticTypes';

export type SemanticEntitySummary = {
    id: string;
    kind: SemanticEntityKind;
    nativeId: string;
    label: string | null;
};

export type SemanticExplanationObject =
    | {
        type: 'entity';
        entity: SemanticEntitySummary;
    }
    | {
        type: 'value';
        valueType: string;
        value: JsonValue;
    };

export type SemanticExplanationAttestation = {
    id: string;
    stance: SemanticAttestationStance;
    sourceKind: SemanticSourceKind;
    sourceIdentity: string | null;
    sourceRef: string | null;
    confidence: number | null;
    rationale: string | null;
    isActive: boolean;
    supersedesAttestationId: string | null;
    supersededByAttestationId: string | null;
    createdAt: string;
    evidence: Array<SemanticEvidenceRef & { id: string }>;
};

export type SemanticExplanationProposition = {
    id: string;
    predicate: string;
    subject: SemanticEntitySummary;
    object: SemanticExplanationObject;
    activeSupportCount: number;
    activeOpposeCount: number;
    attestations: SemanticExplanationAttestation[];
};

export type SemanticExplanationDecision = {
    id: string;
    status: SemanticDecisionStatus;
    propositionId: string | null;
    sourceKind: SemanticSourceKind;
    sourceRef: string | null;
    rationale: string | null;
    supersedesDecisionId: string | null;
    isCurrent: boolean;
    createdAt: string;
};

export type SemanticScopeExplanation = {
    scopeKey: string;
    resolution: SemanticResolution;
    propositions: SemanticExplanationProposition[];
    decisions: SemanticExplanationDecision[];
};

type PropositionRow = {
    id: string;
    predicate: string;
    subject_id: string;
    subject_kind: SemanticEntityKind;
    subject_native_id: string;
    subject_label: string | null;
    object_type: 'entity' | 'value';
    object_entity_id: string | null;
    object_kind: SemanticEntityKind | null;
    object_native_id: string | null;
    object_label: string | null;
    value_type: string | null;
    value_json: string | null;
};

type AttestationRow = {
    id: string;
    stance: SemanticAttestationStance;
    source_kind: SemanticSourceKind;
    source_identity: string | null;
    source_ref: string | null;
    confidence: number | null;
    rationale: string | null;
    supersedes_attestation_id: string | null;
    superseded_by_attestation_id: string | null;
    is_active: number;
    created_at: string;
};

type EvidenceRow = {
    id: string;
    ref_kind: SemanticEvidenceRef['kind'];
    ref_json: string;
    label: string | null;
};

type DecisionRow = {
    id: string;
    status: SemanticDecisionStatus;
    proposition_id: string | null;
    source_kind: SemanticSourceKind;
    source_ref: string | null;
    rationale: string | null;
    supersedes_decision_id: string | null;
    is_current: number;
    created_at: string;
};

function entitySummary(
    id: string,
    kind: SemanticEntityKind,
    nativeId: string,
    label: string | null,
): SemanticEntitySummary {
    return { id, kind, nativeId, label };
}

function propositionObject(row: PropositionRow): SemanticExplanationObject {
    if (row.object_type === 'entity') {
        if (!row.object_entity_id || !row.object_kind || !row.object_native_id) {
            throw new Error(`Semantic proposition '${row.id}' has an incomplete entity object.`);
        }
        return {
            type: 'entity',
            entity: entitySummary(
                row.object_entity_id,
                row.object_kind,
                row.object_native_id,
                row.object_label,
            ),
        };
    }
    if (!row.value_type || row.value_json === null) {
        throw new Error(`Semantic proposition '${row.id}' has an incomplete value object.`);
    }
    return {
        type: 'value',
        valueType: row.value_type,
        value: JSON.parse(row.value_json) as JsonValue,
    };
}

function loadEvidence(db: Database.Database, attestationId: string): Array<SemanticEvidenceRef & { id: string }> {
    const rows = db.prepare(`
        SELECT id, ref_kind, ref_json, label
        FROM semantic_evidence
        WHERE attestation_id = ?
        ORDER BY created_at ASC, id ASC
    `).all(attestationId) as EvidenceRow[];
    return rows.map((row) => ({
        id: row.id,
        kind: row.ref_kind,
        ref: JSON.parse(row.ref_json) as JsonValue,
        label: row.label,
    }));
}

function loadAttestations(db: Database.Database, propositionId: string): SemanticExplanationAttestation[] {
    const rows = db.prepare(`
        SELECT
            a.id,
            a.stance,
            a.source_kind,
            a.source_identity,
            a.source_ref,
            a.confidence,
            a.rationale,
            a.supersedes_attestation_id,
            (
                SELECT successor.id
                FROM semantic_attestations successor
                WHERE successor.supersedes_attestation_id = a.id
                LIMIT 1
            ) AS superseded_by_attestation_id,
            a.created_at,
            CASE WHEN EXISTS (
                SELECT 1
                FROM semantic_attestations successor
                WHERE successor.supersedes_attestation_id = a.id
            ) THEN 0 ELSE 1 END AS is_active
        FROM semantic_attestations a
        WHERE a.proposition_id = ?
        ORDER BY a.created_at ASC, a.id ASC
    `).all(propositionId) as AttestationRow[];
    return rows.map((row) => ({
        id: row.id,
        stance: row.stance,
        sourceKind: row.source_kind,
        sourceIdentity: row.source_identity,
        sourceRef: row.source_ref,
        confidence: row.confidence,
        rationale: row.rationale,
        isActive: row.is_active === 1,
        supersedesAttestationId: row.supersedes_attestation_id,
        supersededByAttestationId: row.superseded_by_attestation_id,
        createdAt: row.created_at,
        evidence: loadEvidence(db, row.id),
    }));
}

function loadPropositions(db: Database.Database, scopeKey: string): SemanticExplanationProposition[] {
    const rows = db.prepare(`
        SELECT
            p.id,
            p.predicate,
            subject.id AS subject_id,
            subject.kind AS subject_kind,
            subject.native_id AS subject_native_id,
            subject.label AS subject_label,
            p.object_type,
            object_entity.id AS object_entity_id,
            object_entity.kind AS object_kind,
            object_entity.native_id AS object_native_id,
            object_entity.label AS object_label,
            p.value_type,
            p.value_json
        FROM semantic_propositions p
        JOIN semantic_entities subject ON subject.id = p.subject_entity_id
        LEFT JOIN semantic_entities object_entity ON object_entity.id = p.object_entity_id
        WHERE p.scope_key = ?
        ORDER BY p.created_at ASC, p.id ASC
    `).all(scopeKey) as PropositionRow[];

    return rows.map((row) => {
        const attestations = loadAttestations(db, row.id);
        return {
            id: row.id,
            predicate: row.predicate,
            subject: entitySummary(row.subject_id, row.subject_kind, row.subject_native_id, row.subject_label),
            object: propositionObject(row),
            activeSupportCount: attestations.filter((item) => item.isActive && item.stance === 'support').length,
            activeOpposeCount: attestations.filter((item) => item.isActive && item.stance === 'oppose').length,
            attestations,
        };
    });
}

function loadDecisions(db: Database.Database, scopeKey: string): SemanticExplanationDecision[] {
    const rows = db.prepare(`
        SELECT
            id,
            status,
            proposition_id,
            source_kind,
            source_ref,
            rationale,
            supersedes_decision_id,
            is_current,
            created_at
        FROM semantic_decisions
        WHERE scope_key = ?
        ORDER BY created_at ASC, id ASC
    `).all(scopeKey) as DecisionRow[];
    return rows.map((row) => ({
        id: row.id,
        status: row.status,
        propositionId: row.proposition_id,
        sourceKind: row.source_kind,
        sourceRef: row.source_ref,
        rationale: row.rationale,
        supersedesDecisionId: row.supersedes_decision_id,
        isCurrent: row.is_current === 1,
        createdAt: row.created_at,
    }));
}

/**
 * UI-shaped read model for answering "what do we think, what else is possible,
 * and why?" for one semantic conflict scope. It intentionally avoids exposing
 * generic graph traversal primitives to UI callers.
 */
export function getSemanticScopeExplanation(
    db: Database.Database,
    scopeKey: string,
): SemanticScopeExplanation {
    return {
        scopeKey,
        resolution: resolveSemanticScope(db, scopeKey),
        propositions: loadPropositions(db, scopeKey),
        decisions: loadDecisions(db, scopeKey),
    };
}
