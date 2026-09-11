import type { NumberedMigration } from './migrationLedger';

export const WP11_MIGRATIONS: readonly NumberedMigration[] = [
    {
        id: '20260911_004_analysis_generations',
        sql: `
            CREATE TABLE analysis_generations (
                id TEXT PRIMARY KEY,
                scope_key TEXT NOT NULL,
                workflow_run_id TEXT NOT NULL,
                step_run_id TEXT NOT NULL,
                subject_execution_id TEXT NOT NULL,
                input_fingerprint TEXT NOT NULL,
                provider TEXT NOT NULL,
                model_key TEXT NOT NULL,
                model_version TEXT NOT NULL,
                model_artifact_checksum TEXT,
                preprocessing_version TEXT NOT NULL,
                config_hash TEXT NOT NULL,
                idempotency_key TEXT NOT NULL UNIQUE,
                supersedes_generation_id TEXT,
                status TEXT NOT NULL CHECK (status IN ('running', 'successful', 'failed', 'superseded')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                finished_at TEXT,
                FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs(id),
                FOREIGN KEY(step_run_id) REFERENCES step_runs(id),
                FOREIGN KEY(subject_execution_id) REFERENCES subject_executions(id),
                FOREIGN KEY(supersedes_generation_id) REFERENCES analysis_generations(id)
            );
            CREATE INDEX idx_analysis_generations_scope_status
                ON analysis_generations(scope_key, status, created_at, id);
            CREATE INDEX idx_analysis_generations_subject_execution
                ON analysis_generations(subject_execution_id, created_at, id);
            CREATE INDEX idx_analysis_generations_supersedes
                ON analysis_generations(supersedes_generation_id)
                WHERE supersedes_generation_id IS NOT NULL;

            CREATE TABLE analysis_generation_heads (
                scope_key TEXT PRIMARY KEY,
                active_generation_id TEXT NOT NULL UNIQUE,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(active_generation_id) REFERENCES analysis_generations(id)
            );
        `,
    },
];