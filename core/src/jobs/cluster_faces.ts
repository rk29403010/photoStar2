
import { DatabaseManager } from '../db';
import { cosineSimilarity } from '../math-utils';
import { v4 as uuidv4 } from 'uuid';

export async function runFaceClusteringJob(
    jobId: string,
    dbManager: DatabaseManager,
    onProgress: (p: any) => void
) {
    const db = dbManager.getDb();

    // 1. Load all embeddings
    // We need to know which asset and which face index each embedding belongs to.
    const rows = db.prepare(`
        SELECT asset_id, data 
        FROM derived_results 
        WHERE task = 'face_recognition'
    `).all() as any[];

    console.log(`[DEBUG] Clustering: Loaded ${rows.length} assets with recognition data.`);

    let allFaces: { assetId: string, faceIndex: number, embedding: number[] }[] = [];

    for (const row of rows) {
        try {
            const data = JSON.parse(row.data);
            if (data.embeddings && Array.isArray(data.embeddings)) {
                data.embeddings.forEach((emb: number[] | null, index: number) => {
                    if (emb) {
                        allFaces.push({
                            assetId: row.asset_id,
                            faceIndex: index,
                            embedding: emb
                        });
                    }
                });
            }
        } catch (e) {
            console.error('Error parsing embedding data:', e);
        }
    }

    console.log(`[DEBUG] Clustering: Found ${allFaces.length} valid face embeddings.`);

    if (allFaces.length === 0) {
        onProgress({ status: 'complete', processed: 0, total: 0 });
        return;
    }

    // 2. Simple Agglomerative Clustering
    // Threshold: 0.6 similarity (= 0.4 distance if distance is 1-sim? No, usually directly sim threshold)
    // Docs say: > 0.65 is plausible match. Let's use 0.65 as threshold.
    const THRESHOLD = 0.65;

    // Start with each face in its own cluster
    // clusterMap maps faceIndex(in allFaces array) -> clusterId
    const clusters: number[][] = allFaces.map((_, i) => [i]);

    // We can use a greedy approach for MVP:
    // Iterate all pairs, if sim > threshold, merge clusters.
    // Optimization: Compute all pairwise similarities first? O(N^2).
    // If N=1000, N^2 = 1M. Javascript can handle this fast.
    // If N=10k, N^2 = 100M. Slower but maybe okay for local job.

    // Let's implement a simple greedy merge.
    // We will maintain a list of active clusters. Each cluster has a "representative" embedding (e.g. average).

    type Cluster = {
        id: string; // Temp ID
        faces: number[]; // Indices into allFaces
        centroid: number[];
    };

    const activeClusters: Cluster[] = [];

    onProgress({ status: 'running', message: 'Clustering...' });

    for (let i = 0; i < allFaces.length; i++) {
        const face = allFaces[i];
        let bestMatch: Cluster | null = null;
        let bestSim = -1;

        // Find best matching existing cluster
        for (const cluster of activeClusters) {
            const sim = cosineSimilarity(face.embedding, cluster.centroid);
            if (sim > THRESHOLD && sim > bestSim) {
                bestSim = sim;
                bestMatch = cluster;
            }
        }

        if (bestMatch) {
            // Add to cluster and update centroid
            bestMatch.faces.push(i);
            // Re-calculate centroid (running average)
            const n = bestMatch.faces.length;
            // newCentroid = (oldSum + newVec) / n
            // Actually, keep sum to avoid drift?
            // Simple approach: weighted average
            // centroid =  (centroid * (n-1) + newVec) / n
            for (let k = 0; k < 512; k++) {
                bestMatch.centroid[k] = (bestMatch.centroid[k] * (n - 1) + face.embedding[k]) / n;
            }
        } else {
            // Create new cluster
            activeClusters.push({
                id: uuidv4(),
                faces: [i],
                centroid: [...face.embedding]
            });
        }

        if (i % 100 === 0) {
            onProgress({ status: 'running', processed: i, total: allFaces.length, message: `Clustering ${i}/${allFaces.length}` });
        }
    }

    console.log(`[DEBUG] Clustering complete. Found ${activeClusters.length} clusters.`);

    // 3. Save to DB
    // Clear old data?
    // "Simple" strategy: for now we wipe people table logic?
    // Or we should be smarter?
    // User asked for "Create simple job". Let's wipe `people` and `face_assignments` for MVP to avoid complexity of incremental updates.

    const wipe = db.transaction(() => {
        db.prepare("DELETE FROM face_assignments").run();
        db.prepare("DELETE FROM people").run();
    });
    wipe();

    const insertPerson = db.prepare("INSERT INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)");
    const insertAssignment = db.prepare("INSERT INTO face_assignments (asset_id, face_index, person_id, confidence) VALUES (?, ?, ?, ?)");

    const saveTransaction = db.transaction(() => {
        let pCount = 0;
        for (const cluster of activeClusters) {
            // Only keep clusters with > 0 faces (always true)
            // Name: "Person <N>"
            pCount++;
            const name = `Person ${pCount}`;

            // Pick a thumbnail: The first face in the cluster
            const firstFaceIdx = cluster.faces[0];
            const firstFace = allFaces[firstFaceIdx];
            // We need the original path... we have assetId.
            // We can resolve it or just store assetId?
            // "thumbnail_path" usually implies a file path.
            // But we might want `preview_path`.
            // Let's look up the asset to get a hint?
            // For now, let's just leave thumbnail_path empty or put the asset_id as reference?
            // DB Schema says `thumbnail_path TEXT`.

            insertPerson.run(cluster.id, name, null);

            for (const faceIdx of cluster.faces) {
                const face = allFaces[faceIdx];
                // confident = sim with centroid?
                const conf = cosineSimilarity(face.embedding, cluster.centroid);
                insertAssignment.run(face.assetId, face.faceIndex, cluster.id, conf);
            }
        }
    });

    saveTransaction();

    onProgress({ status: 'complete', processed: allFaces.length, total: allFaces.length, message: `Created ${activeClusters.length} people.` });
}
