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
];