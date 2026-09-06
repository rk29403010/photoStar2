import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import type {
    JsonValue,
    SemanticAttestationStance,
    SemanticDecisionStatus,
    SemanticEntityKind,
    SemanticEvidenceRef,
    SemanticObjectRef,
    SemanticResolution,
    SemanticSourceKind,
} from './semanticTypes';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type PropositionRow = {
    id: string;
    scope_key: string;
};

type ActiveAttestationRow = {
    proposition_id: string;
    stance: SemanticAttestationStance;
};

type CurrentDecisionRow = {
    id: string;
    status: SemanticDecisionStatus;
    proposition_id: string | null;
};

export type EnsureSemanticEntityInput = {
    kind: SemanticEntityKind;
    nativeId: string;
    label?: string | null;
};

export type PutSemanticPropositionInput = {
    scopeKey: string;
    subjectEntityId: string;
    predicate: string;
    object: SemanticObjectRef;
};

export type AddSemanticAttestationInput = {
    propositionId: string;
    stance: SemanticAttestationStance;
    sourceKind: SemanticSourceKind;
    sourceRef?: string | null;
    confidence?: number | null;
    rationale?: string | null;
    supersedesAttestationId?: string | null;
    evidence?: SemanticEvidenceRef[];
};

export type RecordSemanticDecisionInput = {
    scopeKey: string;
    status: SemanticDecisionStatus;
    propositionId?: string | null;
    sourceKind: SemanticSourceKind;
    sourceRef?: string | null;
    rationale?: string | null;
};

function stableSerialize(value: JsonValue): string {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return JSON.stringify(value);
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error('Semantic value numbers must be finite.');
        }
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
    }
    const entries = Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key]!)}`);
    return `{${entries.join(',')}}`;
}

function assertNonEmpty(value: string, label: string): void {
    if (value.trim().length === 0) {
        throw new Error(`${label} must not be empty.`);
    }
}

function assertEntityExists(db: DbHandle, entityId: string): void {
    const row = db.prepare('SELECT id FROM semantic_entities WHERE id = ?').get(entityId);
    if (!row) {
        throw new Error(`Unknown semantic entity '${entityId}'.`);
    }
}

function loadProposition(db: DbHandle, propositionId: string): PropositionRow {
    const proposition = db.prepare(`
        SELECT id, scope_key
        FROM semantic_propositions
        WHERE id = ?
    `).get(propositionId) as PropositionRow | undefined;
    if (!proposition) {
        throw new Error(`Unknown semantic proposition '${propositionId}'.`);
    }
    return proposition;
}

function propositionCanonicalKey(input: PutSemanticPropositionInput): {
    canonicalKey: string;
    objectEntityId: string | null;
    valueType: string | null;
    valueJson: string | null;
} {
    const objectKey = input.object.type === 'entity'
        ? `entity:${input.object.entityId}`
        : `value:${input.object.valueType}:${stableSerialize(input.object.value)}`;
    const canonicalKey = createHash('sha256')
        .update(input.scopeKey)
        .update('\n')
        .update(input.subjectEntityId)
        .update('\n')
        .update(input.predicate)
        .update('\n')
        .update(objectKey)
        .digest('hex');
    return {
        canonicalKey,
        objectEntityId: input.object.type === 'entity' ? input.object.entityId : null,
        valueType: input.object.type === 'value' ? input.object.valueType : null,
        valueJson: input.object.type === 'value' ? stableSerialize(input.object.value) : null,
    };
}

function assertAttestationConfidence(confidence: number | null | undefined): void {
    if (confidence == null) {
        return;
    }
    if (confidence < 0 || confidence > 1) {
        throw new Error('Semantic attestation confidence must be between 0 and 1.');
    }
}

function assertAttestationSupersession(
    db: DbHandle,
    propositionScope: string,
    sourceKind: SemanticSourceKind,
    supersedesAttestationId: string | null,
): void {
    if (!supersedesAttestationId) {
        return;
    }
    const prior = db.prepare(`
        SELECT p.scope_key, a.source_kind
        FROM semantic_attestations a
        JOIN semantic_propositions p ON p.id = a.proposition_id
        WHERE a.id = ?
    `).get(supersedesAttestationId) as { scope_key: string; source_kind: SemanticSourceKind } | undefined;
    if (!prior) {
        throw new Error(`Unknown superseded semantic attestation '${supersedesAttestationId}'.`);
    }
    if (prior.scope_key !== propositionScope) {
        throw new Error('A semantic attestation can only supersede an attestation in the same scope.');
    }
    if (prior.source_kind !== sourceKind) {
        throw new Error('A semantic attestation can only supersede an attestation from the same source kind.');
    }
}

function insertAttestationRow(
    db: DbHandle,
    attestationId: string,
    input: AddSemanticAttestationInput,
    supersedesAttestationId: string | null,
): void {
    db.prepare(`
        INSERT INTO semantic_attestations (
            id, proposition_id, stance, source_kind, source_ref,
            confidence, rationale, supersedes_attestation_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        attestationId,
        input.propositionId,
        input.stance,
        input.sourceKind,
        input.sourceRef ?? null,
        input.confidence ?? null,
        input.rationale ?? null,
        supersedesAttestationId,
    );
}

function insertEvidenceRows(
    db: DbHandle,
    attestationId: string,
    evidenceRefs: readonly SemanticEvidenceRef[],
): void {
    const insertEvidence = db.prepare(`
        INSERT INTO semantic_evidence (id, attestation_id, ref_kind, ref_json, label)
        VALUES (?, ?, ?, ?, ?)
    `);
    for (const evidence of evidenceRefs) {
        insertEvidence.run(
            uuidv4(),
            attestationId,
            evidence.kind,
            stableSerialize(evidence.ref),
            evidence.label ?? null,
        );
    }
}

export function ensureSemanticEntity(db: DbHandle, input: EnsureSemanticEntityInput): string {
    assertNonEmpty(input.nativeId, 'Semantic entity nativeId');
    const id = `${input.kind}:${input.nativeId}`;
    db.prepare(`
        INSERT INTO semantic_entities (id, kind, native_id, label)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(kind, native_id) DO UPDATE SET
            label = COALESCE(excluded.label, semantic_entities.label)
    `).run(id, input.kind, input.nativeId, input.label ?? null);
    return id;
}

export function putSemanticProposition(db: DbHandle, input: PutSemanticPropositionInput): string {
    assertNonEmpty(input.scopeKey, 'Semantic proposition scopeKey');
    assertNonEmpty(input.predicate, 'Semantic proposition predicate');
    assertEntityExists(db, input.subjectEntityId);
    if (input.object.type === 'entity') {
        assertEntityExists(db, input.object.entityId);
    } else {
        assertNonEmpty(input.object.valueType, 'Semantic proposition valueType');
    }

    const canonical = propositionCanonicalKey(input);
    const id = `proposition:${canonical.canonicalKey}`;
    db.prepare(`
        INSERT OR IGNORE INTO semantic_propositions (
            id, canonical_key, scope_key, subject_entity_id, predicate,
            object_type, object_entity_id, value_type, value_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        canonical.canonicalKey,
        input.scopeKey,
        input.subjectEntityId,
        input.predicate,
        input.object.type,
        canonical.objectEntityId,
        canonical.valueType,
        canonical.valueJson,
    );
    return id;
}

export function addSemanticAttestation(db: DbHandle, input: AddSemanticAttestationInput): string {
    assertAttestationConfidence(input.confidence);
    const proposition = loadProposition(db, input.propositionId);
    const supersedesAttestationId = input.supersedesAttestationId ?? null;
    assertAttestationSupersession(db, proposition.scope_key, input.sourceKind, supersedesAttestationId);

    const attestationId = uuidv4();
    db.transaction(() => {
        insertAttestationRow(db, attestationId, input, supersedesAttestationId);
        insertEvidenceRows(db, attestationId, input.evidence ?? []);
    })();
    return attestationId;
}

export function getSemanticEvidenceForAttestation(db: DbHandle, attestationId: string): SemanticEvidenceRef[] {
    const rows = db.prepare(`
        SELECT ref_kind, ref_json, label
        FROM semantic_evidence
        WHERE attestation_id = ?
        ORDER BY created_at ASC, id ASC
    `).all(attestationId) as Array<{ ref_kind: SemanticEvidenceRef['kind']; ref_json: string; label: string | null }>;
    return rows.map((row) => ({
        kind: row.ref_kind,
        ref: JSON.parse(row.ref_json) as JsonValue,
        label: row.label,
    }));
}

function loadActiveAttestations(db: DbHandle, scopeKey: string): ActiveAttestationRow[] {
    return db.prepare(`
        SELECT a.proposition_id, a.stance
        FROM semantic_attestations a
        JOIN semantic_propositions p ON p.id = a.proposition_id
        WHERE p.scope_key = ?
          AND NOT EXISTS (
              SELECT 1
              FROM semantic_attestations successor
              WHERE successor.supersedes_attestation_id = a.id
          )
        ORDER BY a.created_at ASC, a.id ASC
    `).all(scopeKey) as ActiveAttestationRow[];
}

export function recordSemanticDecision(db: DbHandle, input: RecordSemanticDecisionInput): string {
    if (input.sourceKind === 'machine') {
        throw new Error('Machine sources cannot record semantic decisions; add an attestation instead.');
    }
    const propositionId = input.propositionId ?? null;
    const needsProposition = input.status === 'accepted' || input.status === 'rejected';
    if (needsProposition !== Boolean(propositionId)) {
        throw new Error(`Semantic decision '${input.status}' has an invalid proposition reference.`);
    }
    if (propositionId) {
        const proposition = loadProposition(db, propositionId);
        if (proposition.scope_key !== input.scopeKey) {
            throw new Error('A semantic decision can only reference a proposition in the same scope.');
        }
    }

    const decisionId = uuidv4();
    db.transaction(() => {
        const current = db.prepare(`
            SELECT id
            FROM semantic_decisions
            WHERE scope_key = ? AND is_current = 1
        `).get(input.scopeKey) as { id: string } | undefined;
        if (current) {
            db.prepare('UPDATE semantic_decisions SET is_current = 0 WHERE id = ?').run(current.id);
        }
        db.prepare(`
            INSERT INTO semantic_decisions (
                id, scope_key, status, proposition_id, source_kind,
                source_ref, rationale, supersedes_decision_id, is_current
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
            decisionId,
            input.scopeKey,
            input.status,
            propositionId,
            input.sourceKind,
            input.sourceRef ?? null,
            input.rationale ?? null,
            current?.id ?? null,
        );
    })();
    return decisionId;
}

export function resolveSemanticScope(db: DbHandle, scopeKey: string): SemanticResolution {
    const decision = db.prepare(`
        SELECT id, status, proposition_id
        FROM semantic_decisions
        WHERE scope_key = ? AND is_current = 1
    `).get(scopeKey) as CurrentDecisionRow | undefined;
    if (decision) {
        return {
            scopeKey,
            status: decision.status,
            propositionId: decision.proposition_id,
            candidatePropositionIds: decision.proposition_id ? [decision.proposition_id] : [],
            decisionId: decision.id,
        };
    }

    const active = loadActiveAttestations(db, scopeKey);
    const summary = new Map<string, { support: number; oppose: number }>();
    for (const attestation of active) {
        const counts = summary.get(attestation.proposition_id) ?? { support: 0, oppose: 0 };
        counts[attestation.stance] += 1;
        summary.set(attestation.proposition_id, counts);
    }
    const candidates = [...summary.entries()]
        .filter(([, counts]) => counts.support > 0)
        .map(([propositionId]) => propositionId)
        .sort((left, right) => left.localeCompare(right));
    const hasOpposition = [...summary.values()].some((counts) => counts.oppose > 0);

    if (candidates.length === 1 && !hasOpposition) {
        return {
            scopeKey,
            status: 'proposed',
            propositionId: candidates[0]!,
            candidatePropositionIds: candidates,
            decisionId: null,
        };
    }
    return {
        scopeKey,
        status: candidates.length > 1 || hasOpposition ? 'disputed' : 'unresolved',
        propositionId: null,
        candidatePropositionIds: candidates,
        decisionId: null,
    };
}
