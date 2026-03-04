
import { DatabaseManager } from '../db';
import { cosineSimilarity } from '../math-utils';
import { v4 as uuidv4 } from 'uuid';
import { EventBus } from '../events/bus';
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { waitIfPaused } from '../state';

export async function runFaceClusteringJob(
    jobId: string,
    dbManager: DatabaseManager,
    eventBus: EventBus
) {
    const db = dbManager.getDb();
    const activeJobId = `cluster-batch-${Date.now()}`;

    eventBus.emit({
        type: 'JobStarted',
        jobId: activeJobId,
        pipelineStage: 'analysis'
    });

    // 1. Load all embeddings
    // We need to know which asset and which face index each embedding belongs to.
    const rows = db.prepare(`
        SELECT asset_id, data 
        FROM derived_results 
        WHERE task = 'face_recognition'
    `).all() as { asset_id: string, data: string }[];

    const allFaces: { assetId: string, faceIndex: number, embedding: number[] }[] = [];

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

    if (allFaces.length === 0) {
        eventBus.emit({ type: 'JobCompleted', jobId: activeJobId, pipelineStage: 'analysis' });
        return;
    }

    // 2. Simple Agglomerative Clustering
    const THRESHOLD = 0.65;

    type Cluster = {
        id: string; // Temp ID
        faces: number[]; // Indices into allFaces
        centroid: number[];
    };

    // Naive re-clustering each time (MVP)
    // Wipe existing?
    const activeClusters: Cluster[] = [];

    for (let i = 0; i < allFaces.length; i++) {
        await waitIfPaused();
        const face = allFaces[i];
        let bestMatch: Cluster | null = null;
        let bestSim = -1;

        for (const cluster of activeClusters) {
            const sim = cosineSimilarity(face.embedding, cluster.centroid);
            if (sim > THRESHOLD && sim > bestSim) {
                bestSim = sim;
                bestMatch = cluster;
            }
        }

        if (bestMatch) {
            bestMatch.faces.push(i);
            const n = bestMatch.faces.length;
            for (let k = 0; k < 512; k++) {
                bestMatch.centroid[k] = (bestMatch.centroid[k] * (n - 1) + face.embedding[k]) / n;
            }
        } else {
            activeClusters.push({
                id: uuidv4(),
                faces: [i],
                centroid: [...face.embedding]
            });
        }
    }

    // 3. Match Clusters to Existing Identities (Incremental Logic)
    // Fetch all existing assignments to see if our new clusters overlap with known people
    const existingAssignments = db.prepare("SELECT asset_id, face_index, person_id FROM face_assignments").all() as { asset_id: string, face_index: number, person_id: string }[];
    const prevMap = new Map<string, string>(); // 'assetId_faceIndex' -> person_id
    existingAssignments.forEach(row => {
        prevMap.set(`${row.asset_id}_${row.face_index}`, row.person_id);
    });

    const existingPeopleCount = (db.prepare("SELECT COUNT(*) as count FROM people").get() as { count: number })?.count || 0;
    let newPersonCounter = existingPeopleCount;

    // Assign stable IDs to our dynamic clusters using majority vote
    for (const cluster of activeClusters) {
        const votes = new Map<string, number>();
        for (const faceIdx of cluster.faces) {
            const face = allFaces[faceIdx];
            const pId = prevMap.get(`${face.assetId}_${face.faceIndex}`);
            if (pId) {
                votes.set(pId, (votes.get(pId) || 0) + 1);
            }
        }

        let bestPersonId: string | null = null;
        let maxVotes = 0;
        for (const [pId, count] of votes.entries()) {
            if (count > maxVotes) {
                maxVotes = count;
                bestPersonId = pId;
            }
        }

        if (bestPersonId) {
            cluster.id = bestPersonId; // inherit the known person identity
        } else {
            // New cluster entirely
            cluster.id = uuidv4();
        }
    }

    // 4. Save to DB
    const insertPerson = db.prepare("INSERT OR IGNORE INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)");
    const insertAssignment = db.prepare("INSERT INTO face_assignments (asset_id, face_index, person_id, confidence) VALUES (?, ?, ?, ?)");
    const wipeAssignments = db.prepare("DELETE FROM face_assignments");

    const saveTransaction = db.transaction(() => {
        // Wipe ONLY assignments to handle edge cases (e.g. faces deleted from photos), DO NOT wipe people.
        wipeAssignments.run();

        // Used for naming new people if we have to
        const seenPeopleThisRun = new Set<string>();

        for (const cluster of activeClusters) {
            if (!seenPeopleThisRun.has(cluster.id)) {
                // Determine if this is a newly minted UUID that we must insert, 
                // or an existing person that INSERT OR IGNORE will safely skip over.
                const exists = !!db.prepare("SELECT id FROM people WHERE id = ?").get(cluster.id);
                if (!exists) {
                    newPersonCounter++;
                    insertPerson.run(cluster.id, `Person ${newPersonCounter}`, null);
                }
                seenPeopleThisRun.add(cluster.id);
            }

            for (const faceIdx of cluster.faces) {
                const face = allFaces[faceIdx];
                const conf = cosineSimilarity(face.embedding, cluster.centroid);
                insertAssignment.run(face.assetId, face.faceIndex, cluster.id, conf);
            }

            eventBus.emit({
                type: 'FaceClusteringUpdated',
                clusterId: cluster.id
            });
        }

        // Clean up orphaned people (e.g. users rescanned and deleted photos, resulting in a person having 0 faces left)
        db.prepare("DELETE FROM people WHERE id NOT IN (SELECT DISTINCT person_id FROM face_assignments)").run();
    });

    saveTransaction();

    // 4.5 Apply Manual Overrides (survives DB reset!)
    const applyOverrides = db.transaction(() => {
        // --- ISOLATIONS ---
        const isolations = db.prepare(`
            SELECT a.id as asset_id, m.face_index
            FROM manual_face_isolations m
            JOIN assets a ON a.original_path = m.original_path
        `).all() as { asset_id: string, face_index: number }[];

        for (const iso of isolations) {
            const newPersonId = uuidv4();
            db.prepare("INSERT INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)")
                .run(newPersonId, "Unknown Person", null);
            db.prepare("UPDATE face_assignments SET person_id = ? WHERE asset_id = ? AND face_index = ?")
                .run(newPersonId, iso.asset_id, iso.face_index);
        }

        // --- NAMING & MERGING ---
        const names = db.prepare(`
            SELECT a.id as asset_id, m.face_index, m.name
            FROM manual_face_names m
            JOIN assets a ON a.original_path = m.original_path
        `).all() as { asset_id: string, face_index: number, name: string }[];

        const targetClustersByName = new Map<string, string>(); // name -> person_id

        for (const over of names) {
            const currentAssignment = db.prepare("SELECT person_id FROM face_assignments WHERE asset_id = ? AND face_index = ?").get(over.asset_id, over.face_index) as { person_id: string } | undefined;
            if (!currentAssignment) continue;

            const currentPId = currentAssignment.person_id;

            if (!targetClustersByName.has(over.name)) {
                targetClustersByName.set(over.name, currentPId);
                db.prepare("UPDATE people SET name = ? WHERE id = ?").run(over.name, currentPId);
            } else {
                const canonicalPId = targetClustersByName.get(over.name)!;
                if (currentPId !== canonicalPId) {
                    // Mismatched cluster resolving to same explicit name: MERGE!
                    db.prepare("UPDATE face_assignments SET person_id = ? WHERE person_id = ?").run(canonicalPId, currentPId);
                    db.prepare("DELETE FROM people WHERE id = ?").run(currentPId);
                }
            }
        }
    });

    applyOverrides();

    // 5. Generate Face-Crop Thumbnails for each person
    const libraryDir = dirname(db.name);
    const previewsDir = join(libraryDir, 'previews');
    if (!existsSync(previewsDir)) mkdirSync(previewsDir, { recursive: true });

    console.error(`[Clustering] Generating thumbnails for ${activeClusters.length} people...`);
    let thumbDone = 0;

    for (const cluster of activeClusters) {
        await waitIfPaused();
        try {
            const bestFace = db.prepare(`
                SELECT asset_id, face_index 
                FROM face_assignments 
                WHERE person_id = ? 
                ORDER BY confidence DESC 
                LIMIT 1
            `).get(cluster.id) as { asset_id: string, face_index: number } | undefined;

            if (bestFace) {
                const asset = db.prepare('SELECT original_path, width, height FROM assets WHERE id = ?').get(bestFace.asset_id) as { original_path: string, width: number, height: number } | undefined;
                const detection = db.prepare("SELECT data FROM derived_results WHERE asset_id = ? AND task = 'face_detection'").get(bestFace.asset_id) as { data: string } | undefined;

                if (asset && detection && asset.width && asset.height) {
                    const data = JSON.parse(detection.data);
                    const face = data.faces[bestFace.face_index];
                    if (face) {
                        const box = face.box; // [x1, y1, x2, y2]
                        const fw = box[2] - box[0];
                        const fh = box[3] - box[1];
                        const cx = (box[0] + box[2]) / 2;
                        const cy = (box[1] + box[3]) / 2;

                        // Normalize: 1.5x padded square crop
                        const cropSize = Math.max(fw, fh) * 1.5;
                        let x1 = cx - cropSize / 2;
                        let y1 = cy - cropSize / 2;
                        let x2 = cx + cropSize / 2;
                        let y2 = cy + cropSize / 2;

                        // Clamp and keep square if possible
                        if (x1 < 0) { x2 -= x1; x1 = 0; }
                        if (y1 < 0) { y2 -= y1; y1 = 0; }
                        if (x2 > 1) { x1 -= (x2 - 1); x2 = 1; }
                        if (y2 > 1) { y1 -= (y2 - 1); y2 = 1; }
                        x1 = Math.max(0, x1); y1 = Math.max(0, y1);
                        x2 = Math.min(1, x2); y2 = Math.min(1, y2);

                        const outPath = join(previewsDir, `person-${cluster.id}.webp`);

                        const cropLeft = Math.floor(x1 * asset.width);
                        const cropTop = Math.floor(y1 * asset.height);
                        const cropWidth = Math.floor((x2 - x1) * asset.width);
                        const cropHeight = Math.floor((y2 - y1) * asset.height);

                        // Ensure dimensions are valid for sharp
                        if (cropWidth > 5 && cropHeight > 5) {
                            await sharp(asset.original_path)
                                .rotate()
                                .extract({
                                    left: cropLeft,
                                    top: cropTop,
                                    width: cropWidth,
                                    height: cropHeight
                                })
                                .resize(256, 256)
                                .webp({ quality: 85 })
                                .toFile(outPath);

                            db.prepare("UPDATE people SET thumbnail_path = ? WHERE id = ?").run(outPath, cluster.id);
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Failed to generate thumbnail for person ${cluster.id}:`, e);
        }

        thumbDone++;
        if (thumbDone % 10 === 0 || thumbDone === activeClusters.length) {
            eventBus.emit({
                type: 'JobProgress',
                jobId: activeJobId,
                processedItems: thumbDone,
                totalItems: activeClusters.length,
                currentItemPath: `Person ${thumbDone}`
            });
        }
    }

    eventBus.emit({
        type: 'JobCompleted',
        jobId: activeJobId,
        pipelineStage: 'analysis'
    });
}

