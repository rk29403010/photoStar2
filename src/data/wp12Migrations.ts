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
];