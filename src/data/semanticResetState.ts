import type Database from 'better-sqlite3';

type SemanticEntityRow = {
    id: string;
    kind: string;
    native_id: string;
    label: string | null;
    created_at: string;
};

type SemanticPropositionRow = {
    id: string;
    canonical_key: string;
    scope_key: string;
    subject_entity_id: string;
    predicate: string;
    object_type: string;
    object_entity_id: string | null;
    value_type: string | null;
    value_json: string | null;
    created_at: string;
};

type SemanticAttestationRow = {
    id: string;
    proposition_id: string;
    stance: string;
    source_kind: string;
    source_identity: string | null;
    source_ref: string | null;
    confidence: number | null;
    rationale: string | null;
    supersedes_attestation_id: string | null;
    created_at: string;
};

type SemanticEvidenceRow = {
    id: string;
    attestation_id: string;
    ref_kind: string;
    ref_json: string;
    label: string | null;
    created_at: string;
};

type SemanticDecisionRow = {
    id: string;
    scope_key: string;
    status: string;
    proposition_id: string | null;
    source_kind: string;
    source_ref: string | null;
    rationale: string | null;
    supersedes_decision_id: string | null;
    is_current: number;
    created_at: string;
};

type ArchiveRepresentationRow = {
    id: string;
    asset_identity_guid: string;
    subject_entity_id: string;
    representation_kind: string;
    facet: string | null;
    source_kind: string;
    source_ref: string | null;
    derived_from_representation_id: string | null;
    created_at: string;
};

export type DurableSemanticResetState = {
    entities: SemanticEntityRow[];
    propositions: SemanticPropositionRow[];
    attestations: SemanticAttestationRow[];
    evidence: SemanticEvidenceRow[];
    decisions: SemanticDecisionRow[];
    representations: ArchiveRepresentationRow[];
};

const DURABLE_ATTESTATION_CTE = `
    WITH RECURSIVE durable_attestation_ids(id) AS (
        SELECT id
        FROM semantic_attestations
        WHERE source_kind IN ('human', 'import')
        UNION
        SELECT attestation.supersedes_attestation_id
        FROM semantic_attestations attestation
        JOIN durable_attestation_ids durable ON durable.id = attestation.id
        WHERE attestation.supersedes_attestation_id IS NOT NULL
    )
`;

const DURABLE_DECISION_CTE = `
    WITH RECURSIVE durable_decision_ids(id) AS (
        SELECT id
        FROM semantic_decisions
        WHERE source_kind != 'machine'
        UNION
        SELECT decision.supersedes_decision_id
        FROM semantic_decisions decision
        JOIN durable_decision_ids durable ON durable.id = decision.id
        WHERE decision.supersedes_decision_id IS NOT NULL
    )
`;

const DURABLE_REPRESENTATION_CTE = `
    WITH RECURSIVE durable_representation_ids(id) AS (
        SELECT id
        FROM archive_representations
        WHERE source_kind IN ('human', 'import')
        UNION
        SELECT representation.derived_from_representation_id
        FROM archive_representations representation
        JOIN durable_representation_ids durable ON durable.id = representation.id
        WHERE representation.derived_from_representation_id IS NOT NULL
    )
`;

function snapshotPropositions(db: Database.Database): SemanticPropositionRow[] {
    return db.prepare(`
        ${DURABLE_ATTESTATION_CTE},
        durable_decision_ids(id) AS (
            SELECT id
            FROM semantic_decisions
            WHERE source_kind != 'machine'
            UNION
            SELECT decision.supersedes_decision_id
            FROM semantic_decisions decision
            JOIN durable_decision_ids durable ON durable.id = decision.id
            WHERE decision.supersedes_decision_id IS NOT NULL
        )
        SELECT DISTINCT proposition.*
        FROM semantic_propositions proposition
        WHERE EXISTS (
            SELECT 1
            FROM semantic_attestations attestation
            JOIN durable_attestation_ids durable ON durable.id = attestation.id
            WHERE attestation.proposition_id = proposition.id
        )
        OR EXISTS (
            SELECT 1
            FROM semantic_decisions decision
            JOIN durable_decision_ids durable ON durable.id = decision.id
            WHERE decision.proposition_id = proposition.id
        )
        ORDER BY proposition.created_at ASC, proposition.id ASC
    `).all() as SemanticPropositionRow[];
}

export function snapshotDurableSemanticResetState(db: Database.Database): DurableSemanticResetState {
    const entities = db.prepare(`
        SELECT id, kind, native_id, label, created_at
        FROM semantic_entities
        ORDER BY created_at ASC, id ASC
    `).all() as SemanticEntityRow[];
    const attestations = db.prepare(`
        ${DURABLE_ATTESTATION_CTE}
        SELECT attestation.*
        FROM semantic_attestations attestation
        JOIN durable_attestation_ids durable ON durable.id = attestation.id
        ORDER BY attestation.created_at ASC, attestation.id ASC
    `).all() as SemanticAttestationRow[];
    const evidence = db.prepare(`
        ${DURABLE_ATTESTATION_CTE}
        SELECT evidence.*
        FROM semantic_evidence evidence
        JOIN durable_attestation_ids durable ON durable.id = evidence.attestation_id
        ORDER BY evidence.created_at ASC, evidence.id ASC
    `).all() as SemanticEvidenceRow[];
    const decisions = db.prepare(`
        ${DURABLE_DECISION_CTE}
        SELECT decision.*
        FROM semantic_decisions decision
        JOIN durable_decision_ids durable ON durable.id = decision.id
        ORDER BY decision.created_at ASC, decision.id ASC
    `).all() as SemanticDecisionRow[];
    const representations = db.prepare(`
        ${DURABLE_REPRESENTATION_CTE}
        SELECT representation.*
        FROM archive_representations representation
        JOIN durable_representation_ids durable ON durable.id = representation.id
        ORDER BY representation.created_at ASC, representation.id ASC
    `).all() as ArchiveRepresentationRow[];

    return {
        entities,
        propositions: snapshotPropositions(db),
        attestations,
        evidence,
        decisions,
        representations,
    };
}

function restoreEntities(db: Database.Database, rows: readonly SemanticEntityRow[]): void {
    const insert = db.prepare(`
        INSERT INTO semantic_entities (id, kind, native_id, label, created_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
        insert.run(row.id, row.kind, row.native_id, row.label, row.created_at);
    }
}

function restorePropositions(db: Database.Database, rows: readonly SemanticPropositionRow[]): void {
    const insert = db.prepare(`
        INSERT INTO semantic_propositions (
            id, canonical_key, scope_key, subject_entity_id, predicate,
            object_type, object_entity_id, value_type, value_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
        insert.run(
            row.id,
            row.canonical_key,
            row.scope_key,
            row.subject_entity_id,
            row.predicate,
            row.object_type,
            row.object_entity_id,
            row.value_type,
            row.value_json,
            row.created_at,
        );
    }
}

function restoreAttestations(db: Database.Database, rows: readonly SemanticAttestationRow[]): void {
    const insert = db.prepare(`
        INSERT INTO semantic_attestations (
            id, proposition_id, stance, source_kind, source_identity, source_ref, confidence,
            rationale, supersedes_attestation_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `);
    for (const row of rows) {
        insert.run(
            row.id,
            row.proposition_id,
            row.stance,
            row.source_kind,
            row.source_identity,
            row.source_ref,
            row.confidence,
            row.rationale,
            row.created_at,
        );
    }

    const connectParent = db.prepare(`
        UPDATE semantic_attestations
        SET supersedes_attestation_id = ?
        WHERE id = ?
    `);
    for (const row of rows) {
        if (row.supersedes_attestation_id) {
            connectParent.run(row.supersedes_attestation_id, row.id);
        }
    }
}

function restoreEvidence(db: Database.Database, rows: readonly SemanticEvidenceRow[]): void {
    const insert = db.prepare(`
        INSERT INTO semantic_evidence (id, attestation_id, ref_kind, ref_json, label, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
        insert.run(row.id, row.attestation_id, row.ref_kind, row.ref_json, row.label, row.created_at);
    }
}

function restoreDecisions(db: Database.Database, rows: readonly SemanticDecisionRow[]): void {
    const insert = db.prepare(`
        INSERT INTO semantic_decisions (
            id, scope_key, status, proposition_id, source_kind, source_ref,
            rationale, supersedes_decision_id, is_current, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `);
    for (const row of rows) {
        insert.run(
            row.id,
            row.scope_key,
            row.status,
            row.proposition_id,
            row.source_kind,
            row.source_ref,
            row.rationale,
            row.is_current,
            row.created_at,
        );
    }

    const connectParent = db.prepare(`
        UPDATE semantic_decisions
        SET supersedes_decision_id = ?
        WHERE id = ?
    `);
    for (const row of rows) {
        if (row.supersedes_decision_id) {
            connectParent.run(row.supersedes_decision_id, row.id);
        }
    }
}

function restoreRepresentations(db: Database.Database, rows: readonly ArchiveRepresentationRow[]): void {
    const insert = db.prepare(`
        INSERT INTO archive_representations (
            id, asset_identity_guid, subject_entity_id, representation_kind,
            facet, source_kind, source_ref, derived_from_representation_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `);
    for (const row of rows) {
        insert.run(
            row.id,
            row.asset_identity_guid,
            row.subject_entity_id,
            row.representation_kind,
            row.facet,
            row.source_kind,
            row.source_ref,
            row.created_at,
        );
    }

    const connectParent = db.prepare(`
        UPDATE archive_representations
        SET derived_from_representation_id = ?
        WHERE id = ?
    `);
    for (const row of rows) {
        if (row.derived_from_representation_id) {
            connectParent.run(row.derived_from_representation_id, row.id);
        }
    }
}

export function restoreDurableSemanticResetState(
    db: Database.Database,
    state: DurableSemanticResetState,
): void {
    restoreEntities(db, state.entities);
    restorePropositions(db, state.propositions);
    restoreAttestations(db, state.attestations);
    restoreEvidence(db, state.evidence);
    restoreDecisions(db, state.decisions);
    restoreRepresentations(db, state.representations);
}
