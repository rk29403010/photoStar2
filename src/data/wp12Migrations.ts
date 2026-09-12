import type { NumberedMigration } from './migrationLedger';

export const WP12_MIGRATIONS: readonly NumberedMigration[] = [
    {
        id: '20260912_001_identity_clusters',
        sql: `
            CREATE TABLE identity_clusters (
                id TEXT PRIMARY KEY,
                algorithm_key TEXT NOT NULL,
                algorithm_version TEXT NOT NULL,
                threshold REAL NOT NULL,
                centroid_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX idx_identity_clusters_algorithm
                ON identity_clusters(algorithm_key, algorithm_version, created_at, id);

            CREATE TABLE identity_cluster_members (
                cluster_id TEXT NOT NULL,
                face_id TEXT NOT NULL,
                confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(cluster_id, face_id),
                UNIQUE(face_id),
                FOREIGN KEY(cluster_id) REFERENCES identity_clusters(id) ON DELETE CASCADE,
                FOREIGN KEY(face_id) REFERENCES faces(id) ON DELETE CASCADE
            );
            CREATE INDEX idx_identity_cluster_members_face
                ON identity_cluster_members(face_id, cluster_id);
        `,
    },
    {
        id: '20260912_002_person_lifecycle_redirects',
        sql: `
            ALTER TABLE people
                ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'provisional'
                CHECK (lifecycle_status IN ('provisional', 'confirmed', 'merged', 'retired'));

            UPDATE people
            SET lifecycle_status = 'confirmed'
            WHERE EXISTS (
                SELECT 1
                FROM semantic_entities entity
                WHERE entity.kind = 'person'
                  AND entity.native_id = people.id
            );

            CREATE TABLE person_redirects (
                old_person_id TEXT PRIMARY KEY,
                current_person_id TEXT NOT NULL,
                reason_decision_id TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(old_person_id) REFERENCES people(id),
                FOREIGN KEY(current_person_id) REFERENCES people(id),
                FOREIGN KEY(reason_decision_id) REFERENCES semantic_decisions(id),
                CHECK (old_person_id <> current_person_id)
            );
            CREATE INDEX idx_person_redirects_current
                ON person_redirects(current_person_id, created_at, old_person_id);
        `,
    },
    {
        id: '20260912_003_face_person_candidates',
        sql: `
            CREATE TABLE face_person_candidates (
                face_id TEXT NOT NULL,
                person_id TEXT NOT NULL,
                source_analysis_generation_id TEXT NOT NULL,
                anchor_face_id TEXT NOT NULL,
                anchor_analysis_generation_id TEXT NOT NULL,
                raw_cosine REAL NOT NULL CHECK (raw_cosine >= -1.0 AND raw_cosine <= 1.0),
                rank INTEGER NOT NULL CHECK (rank > 0),
                runner_up_score REAL CHECK (runner_up_score IS NULL OR (runner_up_score >= -1.0 AND runner_up_score <= 1.0)),
                winner_margin REAL CHECK (winner_margin IS NULL OR (winner_margin >= 0.0 AND winner_margin <= 2.0)),
                model_key TEXT NOT NULL,
                model_version TEXT NOT NULL,
                preprocessing_version TEXT NOT NULL,
                config_hash TEXT NOT NULL,
                decision_status TEXT CHECK (decision_status IS NULL OR decision_status IN ('accepted', 'rejected')),
                review_eligible INTEGER NOT NULL CHECK (review_eligible IN (0, 1)),
                auto_action_eligible INTEGER NOT NULL CHECK (auto_action_eligible IN (0, 1)),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(face_id, person_id),
                FOREIGN KEY(face_id) REFERENCES faces(id) ON DELETE CASCADE,
                FOREIGN KEY(person_id) REFERENCES people(id),
                FOREIGN KEY(source_analysis_generation_id) REFERENCES analysis_generations(id),
                FOREIGN KEY(anchor_face_id) REFERENCES faces(id),
                FOREIGN KEY(anchor_analysis_generation_id) REFERENCES analysis_generations(id)
            );
            CREATE INDEX idx_face_person_candidates_face_rank
                ON face_person_candidates(face_id, rank, person_id);
            CREATE INDEX idx_face_person_candidates_person_score
                ON face_person_candidates(person_id, raw_cosine DESC, face_id);
            CREATE INDEX idx_face_person_candidates_source_generation
                ON face_person_candidates(source_analysis_generation_id, face_id);
        `,
    },
];