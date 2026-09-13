import type { DatabaseManager } from '../../data/db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type IdentityClusterMemberInput = {
    faceId: string;
    confidence: number;
};

export type IdentityClusterInput = {
    id: string;
    centroid: number[];
    members: IdentityClusterMemberInput[];
};

export type StoredIdentityCluster = {
    id: string;
    centroid: number[];
    faceIds: string[];
};

export type ReplaceIdentityClustersInput = {
    algorithmKey: string;
    algorithmVersion: string;
    threshold: number;
    clusters: IdentityClusterInput[];
};

function assertFiniteVector(vector: number[]): void {
    if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
        throw new Error('IdentityCluster centroid must contain finite values.');
    }
}

function assertConfidence(confidence: number): void {
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new Error('IdentityCluster member confidence must be between 0 and 1.');
    }
}

export function loadIdentityClusters(db: DbHandle): StoredIdentityCluster[] {
    const rows = db.prepare(`
        SELECT c.id, c.centroid_json, m.face_id
        FROM identity_clusters c
        LEFT JOIN identity_cluster_members m ON m.cluster_id = c.id
        ORDER BY c.id ASC, m.face_id ASC
    `).all() as Array<{ id: string; centroid_json: string; face_id: string | null }>;
    const byId = new Map<string, StoredIdentityCluster>();

    for (const row of rows) {
        let cluster = byId.get(row.id);
        if (!cluster) {
            cluster = {
                id: row.id,
                centroid: JSON.parse(row.centroid_json) as number[],
                faceIds: [],
            };
            byId.set(row.id, cluster);
        }
        if (row.face_id) {
            cluster.faceIds.push(row.face_id);
        }
    }
    return [...byId.values()];
}

/**
 * Replaces the current rebuildable machine clustering projection atomically.
 * This store deliberately has no Person foreign key: IdentityCluster is machine
 * analysis and must be safe to rebuild without mutating durable Person truth.
 */
export function replaceIdentityClusters(db: DbHandle, input: ReplaceIdentityClustersInput): void {
    if (!Number.isFinite(input.threshold)) {
        throw new Error('IdentityCluster threshold must be finite.');
    }

    const insertCluster = db.prepare(`
        INSERT INTO identity_clusters (
            id, algorithm_key, algorithm_version, threshold, centroid_json
        ) VALUES (?, ?, ?, ?, ?)
    `);
    const insertMember = db.prepare(`
        INSERT INTO identity_cluster_members (cluster_id, face_id, confidence)
        VALUES (?, ?, ?)
    `);

    db.transaction(() => {
        db.prepare('DELETE FROM identity_cluster_members').run();
        db.prepare('DELETE FROM identity_clusters').run();

        for (const cluster of input.clusters) {
            assertFiniteVector(cluster.centroid);
            insertCluster.run(
                cluster.id,
                input.algorithmKey,
                input.algorithmVersion,
                input.threshold,
                JSON.stringify(cluster.centroid),
            );
            for (const member of cluster.members) {
                assertConfidence(member.confidence);
                insertMember.run(cluster.id, member.faceId, member.confidence);
            }
        }
    })();
}
