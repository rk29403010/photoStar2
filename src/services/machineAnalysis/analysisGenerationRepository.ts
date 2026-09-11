import { randomUUID } from 'node:crypto';
import type { DatabaseManager } from '../../data/db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type AnalysisGenerationStatus = 'running' | 'successful' | 'failed' | 'superseded';

export type AnalysisGeneration = {
    id: string;
    scopeKey: string;
    workflowRunId: string;
    stepRunId: string;
    subjectExecutionId: string;
    inputFingerprint: string;
    provider: string;
    modelKey: string;
    modelVersion: string;
    modelArtifactChecksum: string | null;
    preprocessingVersion: string;
    configHash: string;
    idempotencyKey: string;
    supersedesGenerationId: string | null;
    status: AnalysisGenerationStatus;
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
};

export type StartAnalysisGenerationInput = {
    scopeKey: string;
    workflowRunId: string;
    stepRunId: string;
    subjectExecutionId: string;
    inputFingerprint: string;
    provider: string;
    modelKey: string;
    modelVersion: string;
    modelArtifactChecksum?: string | null;
    preprocessingVersion: string;
    configHash: string;
    idempotencyKey: string;
};

type AnalysisGenerationRow = {
    id: string;
    scope_key: string;
    workflow_run_id: string;
    step_run_id: string;
    subject_execution_id: string;
    input_fingerprint: string;
    provider: string;
    model_key: string;
    model_version: string;
    model_artifact_checksum: string | null;
    preprocessing_version: string;
    config_hash: string;
    idempotency_key: string;
    supersedes_generation_id: string | null;
    status: AnalysisGenerationStatus;
    created_at: string;
    updated_at: string;
    finished_at: string | null;
};

const GENERATION_SELECT = `
    SELECT id, scope_key, workflow_run_id, step_run_id, subject_execution_id,
           input_fingerprint, provider, model_key, model_version,
           model_artifact_checksum, preprocessing_version, config_hash,
           idempotency_key, supersedes_generation_id, status,
           created_at, updated_at, finished_at
    FROM analysis_generations
`;

function mapGeneration(row: AnalysisGenerationRow): AnalysisGeneration {
    return {
        id: row.id,
        scopeKey: row.scope_key,
        workflowRunId: row.workflow_run_id,
        stepRunId: row.step_run_id,
        subjectExecutionId: row.subject_execution_id,
        inputFingerprint: row.input_fingerprint,
        provider: row.provider,
        modelKey: row.model_key,
        modelVersion: row.model_version,
        modelArtifactChecksum: row.model_artifact_checksum,
        preprocessingVersion: row.preprocessing_version,
        configHash: row.config_hash,
        idempotencyKey: row.idempotency_key,
        supersedesGenerationId: row.supersedes_generation_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        finishedAt: row.finished_at,
    };
}

function readGeneration(db: DbHandle, id: string): AnalysisGeneration | null {
    const row = db.prepare(`${GENERATION_SELECT} WHERE id = ?`).get(id) as AnalysisGenerationRow | undefined;
    return row ? mapGeneration(row) : null;
}

function readGenerationByIdempotencyKey(db: DbHandle, idempotencyKey: string): AnalysisGeneration | null {
    const row = db.prepare(`${GENERATION_SELECT} WHERE idempotency_key = ?`).get(idempotencyKey) as AnalysisGenerationRow | undefined;
    return row ? mapGeneration(row) : null;
}

export function getActiveAnalysisGeneration(db: DbHandle, scopeKey: string): AnalysisGeneration | null {
    const row = db.prepare(`
        ${GENERATION_SELECT}
        WHERE id = (
            SELECT active_generation_id
            FROM analysis_generation_heads
            WHERE scope_key = ?
        )
    `).get(scopeKey) as AnalysisGenerationRow | undefined;
    return row ? mapGeneration(row) : null;
}

function immutableInputMatches(generation: AnalysisGeneration, input: StartAnalysisGenerationInput): boolean {
    return generation.scopeKey === input.scopeKey
        && generation.workflowRunId === input.workflowRunId
        && generation.stepRunId === input.stepRunId
        && generation.subjectExecutionId === input.subjectExecutionId
        && generation.inputFingerprint === input.inputFingerprint
        && generation.provider === input.provider
        && generation.modelKey === input.modelKey
        && generation.modelVersion === input.modelVersion
        && generation.modelArtifactChecksum === (input.modelArtifactChecksum ?? null)
        && generation.preprocessingVersion === input.preprocessingVersion
        && generation.configHash === input.configHash;
}

export function startAnalysisGeneration(db: DbHandle, input: StartAnalysisGenerationInput): AnalysisGeneration {
    return db.transaction(() => {
        const existing = readGenerationByIdempotencyKey(db, input.idempotencyKey);
        if (existing) {
            if (!immutableInputMatches(existing, input)) {
                throw new Error(`Analysis generation idempotency key '${input.idempotencyKey}' was reused with different provenance.`);
            }
            return existing;
        }

        const active = getActiveAnalysisGeneration(db, input.scopeKey);
        const id = randomUUID();
        db.prepare(`
            INSERT INTO analysis_generations (
                id, scope_key, workflow_run_id, step_run_id, subject_execution_id,
                input_fingerprint, provider, model_key, model_version,
                model_artifact_checksum, preprocessing_version, config_hash,
                idempotency_key, supersedes_generation_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')
        `).run(
            id,
            input.scopeKey,
            input.workflowRunId,
            input.stepRunId,
            input.subjectExecutionId,
            input.inputFingerprint,
            input.provider,
            input.modelKey,
            input.modelVersion,
            input.modelArtifactChecksum ?? null,
            input.preprocessingVersion,
            input.configHash,
            input.idempotencyKey,
            active?.id ?? null,
        );
        return readGeneration(db, id)!;
    })();
}

export function markAnalysisGenerationFailed(db: DbHandle, id: string): AnalysisGeneration {
    return db.transaction(() => {
        const generation = readGeneration(db, id);
        if (!generation) {
            throw new Error(`Unknown analysis generation '${id}'.`);
        }
        if (generation.status === 'failed') {
            return generation;
        }
        if (generation.status !== 'running') {
            throw new Error(`Analysis generation '${id}' cannot fail from status '${generation.status}'.`);
        }
        db.prepare(`
            UPDATE analysis_generations
            SET status = 'failed', updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(id);
        return readGeneration(db, id)!;
    })();
}

export function markAnalysisGenerationSuccessful(db: DbHandle, id: string): AnalysisGeneration {
    return db.transaction(() => {
        const generation = readGeneration(db, id);
        if (!generation) {
            throw new Error(`Unknown analysis generation '${id}'.`);
        }
        if (generation.status === 'successful') {
            return generation;
        }
        if (generation.status !== 'running') {
            throw new Error(`Analysis generation '${id}' cannot succeed from status '${generation.status}'.`);
        }

        const active = getActiveAnalysisGeneration(db, generation.scopeKey);
        const activeId = active?.id ?? null;
        if (activeId !== generation.supersedesGenerationId) {
            throw new Error(`Analysis generation '${id}' is stale because its scope acquired a newer active generation.`);
        }

        db.prepare(`
            UPDATE analysis_generations
            SET status = 'successful', updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(id);
        if (active) {
            db.prepare(`
                UPDATE analysis_generations
                SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(active.id);
        }
        db.prepare(`
            INSERT INTO analysis_generation_heads (scope_key, active_generation_id, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(scope_key) DO UPDATE SET
                active_generation_id = excluded.active_generation_id,
                updated_at = CURRENT_TIMESTAMP
        `).run(generation.scopeKey, id);
        return readGeneration(db, id)!;
    })();
}

export function getAnalysisGeneration(db: DbHandle, id: string): AnalysisGeneration | null {
    return readGeneration(db, id);
}
