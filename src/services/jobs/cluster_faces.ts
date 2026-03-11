import type { DatabaseManager } from '../../data/db';
import { cosineSimilarity } from '../math-utils';
import { v4 as uuidv4 } from 'uuid';
import type { EventBus } from '../events/bus';
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { waitIfPaused } from '../state';

type FaceRef = { assetId: string; faceIndex: number; embedding: number[] };
type Cluster = { id: string; faces: number[]; centroid: number[] };

function loadRecognisedFaces(db: ReturnType<DatabaseManager['getDb']>): FaceRef[] {
    const rows = db.prepare(`
        SELECT asset_id, data
        FROM derived_results
        WHERE task = 'face_recognition'
    `).all() as { asset_id: string; data: string }[];

    const allFaces: FaceRef[] = [];
    for (const row of rows) {
        try {
            const data = JSON.parse(row.data);
            if (!Array.isArray(data.embeddings)) {continue;}
            data.embeddings.forEach((emb: number[] | null, index: number) => {
                if (!emb) {return;}
                allFaces.push({ assetId: row.asset_id, faceIndex: index, embedding: emb });
            });
        } catch (e) {
            console.error('Error parsing embedding data:', e);
        }
    }
    return allFaces;
}

async function buildClusters(
    allFaces: FaceRef[],
    threshold: number,
    signal?: AbortSignal
): Promise<Cluster[]> {
    const activeClusters: Cluster[] = [];
    for (let i = 0; i < allFaces.length; i++) {
        if (signal?.aborted) {
            console.log('Clustering cancelled during phase 1.');
            break;
        }
        await waitIfPaused(signal);

        const face = allFaces[i];
        let bestMatch: Cluster | null = null;
        let bestSim = -1;

        for (const cluster of activeClusters) {
            const sim = cosineSimilarity(face.embedding, cluster.centroid);
            if (sim > threshold && sim > bestSim) {
                bestSim = sim;
                bestMatch = cluster;
            }
        }

        if (!bestMatch) {
            activeClusters.push({ id: uuidv4(), faces: [i], centroid: [...face.embedding] });
            continue;
        }

        bestMatch.faces.push(i);
        const n = bestMatch.faces.length;
        for (let k = 0; k < bestMatch.centroid.length; k++) {
            bestMatch.centroid[k] = (bestMatch.centroid[k] * (n - 1) + face.embedding[k]) / n;
        }
    }
    return activeClusters;
}

function assignStableClusterIds(
    db: ReturnType<DatabaseManager['getDb']>,
    allFaces: FaceRef[],
    activeClusters: Cluster[]
): void {
    const existingAssignments = db.prepare(
        'SELECT asset_id, face_index, person_id FROM face_assignments'
    ).all() as { asset_id: string; face_index: number; person_id: string }[];

    const prevMap = new Map<string, string>();
    existingAssignments.forEach(row => {
        prevMap.set(`${row.asset_id}_${row.face_index}`, row.person_id);
    });

    for (const cluster of activeClusters) {
        const votes = new Map<string, number>();
        for (const faceIdx of cluster.faces) {
            const face = allFaces[faceIdx];
            const pId = prevMap.get(`${face.assetId}_${face.faceIndex}`);
            if (pId) {votes.set(pId, (votes.get(pId) || 0) + 1);}
        }

        let bestPersonId: string | null = null;
        let maxVotes = 0;
        for (const [pId, count] of votes.entries()) {
            if (count > maxVotes) {
                maxVotes = count;
                bestPersonId = pId;
            }
        }

        cluster.id = bestPersonId || uuidv4();
    }
}

function persistClusters(
    db: ReturnType<DatabaseManager['getDb']>,
    eventBus: EventBus,
    activeClusters: Cluster[],
    allFaces: FaceRef[]
): void {
    const existingPeopleCount = (db.prepare('SELECT COUNT(*) as count FROM people').get() as { count: number })?.count || 0;
    let newPersonCounter = existingPeopleCount;

    const insertPerson = db.prepare('INSERT OR IGNORE INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)');
    const insertAssignment = db.prepare('INSERT INTO face_assignments (asset_id, face_index, person_id, confidence) VALUES (?, ?, ?, ?)');
    const wipeAssignments = db.prepare('DELETE FROM face_assignments');

    db.transaction(() => {
        wipeAssignments.run();
        const seenPeopleThisRun = new Set<string>();

        for (const cluster of activeClusters) {
            if (!seenPeopleThisRun.has(cluster.id)) {
                const exists = Boolean(db.prepare('SELECT id FROM people WHERE id = ?').get(cluster.id));
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

            eventBus.emit({ type: 'FaceClusteringUpdated', clusterId: cluster.id });
        }

        db.prepare('DELETE FROM people WHERE id NOT IN (SELECT DISTINCT person_id FROM face_assignments)').run();
    })();
}

function applyManualOverrides(db: ReturnType<DatabaseManager['getDb']>): void {
    db.transaction(() => {
        const isolations = db.prepare(`
            SELECT a.id as asset_id, m.face_index
            FROM manual_face_isolations m
            JOIN assets a ON a.original_path = m.original_path
        `).all() as { asset_id: string; face_index: number }[];

        for (const iso of isolations) {
            const newPersonId = uuidv4();
            db.prepare('INSERT INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)').run(newPersonId, 'Unknown Person', null);
            db.prepare('UPDATE face_assignments SET person_id = ? WHERE asset_id = ? AND face_index = ?')
                .run(newPersonId, iso.asset_id, iso.face_index);
        }

        const names = db.prepare(`
            SELECT a.id as asset_id, m.face_index, m.name
            FROM manual_face_names m
            JOIN assets a ON a.original_path = m.original_path
        `).all() as { asset_id: string; face_index: number; name: string }[];

        const targetClustersByName = new Map<string, string>();
        for (const over of names) {
            const currentAssignment = db.prepare(
                'SELECT person_id FROM face_assignments WHERE asset_id = ? AND face_index = ?'
            ).get(over.asset_id, over.face_index) as { person_id: string } | undefined;
            if (!currentAssignment) {continue;}

            const currentPId = currentAssignment.person_id;
            if (!targetClustersByName.has(over.name)) {
                targetClustersByName.set(over.name, currentPId);
                db.prepare('UPDATE people SET name = ? WHERE id = ?').run(over.name, currentPId);
                continue;
            }

            const canonicalPId = targetClustersByName.get(over.name)!;
            if (currentPId !== canonicalPId) {
                db.prepare('UPDATE face_assignments SET person_id = ? WHERE person_id = ?').run(canonicalPId, currentPId);
                db.prepare('DELETE FROM people WHERE id = ?').run(currentPId);
            }
        }
    })();
}

function clampUnitBounds(box: number[]): [number, number, number, number] {
    const fw = box[2] - box[0];
    const fh = box[3] - box[1];
    const cx = (box[0] + box[2]) / 2;
    const cy = (box[1] + box[3]) / 2;

    const cropSize = Math.max(fw, fh) * 1.5;
    let x1 = cx - cropSize / 2;
    let y1 = cy - cropSize / 2;
    let x2 = cx + cropSize / 2;
    let y2 = cy + cropSize / 2;

    if (x1 < 0) { x2 -= x1; x1 = 0; }
    if (y1 < 0) { y2 -= y1; y1 = 0; }
    if (x2 > 1) { x1 -= (x2 - 1); x2 = 1; }
    if (y2 > 1) { y1 -= (y2 - 1); y2 = 1; }

    return [Math.max(0, x1), Math.max(0, y1), Math.min(1, x2), Math.min(1, y2)];
}

async function generatePersonThumbnails(
    db: ReturnType<DatabaseManager['getDb']>,
    eventBus: EventBus,
    activeClusters: Cluster[],
    activeJobId: string,
    signal?: AbortSignal
): Promise<void> {
    const libraryDir = dirname(db.name);
    const previewsDir = join(libraryDir, 'previews');
    if (!existsSync(previewsDir)) {mkdirSync(previewsDir, { recursive: true });}

    let thumbDone = 0;
    for (const cluster of activeClusters) {
        if (signal?.aborted) {
            console.log('Clustering cancelled during phase 2.');
            break;
        }
        await waitIfPaused(signal);

        try {
            await createThumbnailForCluster(db, previewsDir, cluster.id);
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
}

type ThumbnailSource = {
    personId: string;
    originalPath: string;
    width: number;
    height: number;
    box: number[];
};

function getThumbnailSource(
    db: ReturnType<DatabaseManager['getDb']>,
    personId: string
): ThumbnailSource | null {
    const bestFace = db.prepare(`
        SELECT asset_id, face_index
        FROM face_assignments
        WHERE person_id = ?
        ORDER BY confidence DESC
        LIMIT 1
    `).get(personId) as { asset_id: string; face_index: number } | undefined;
    if (!bestFace) {return null;}

    const asset = db.prepare('SELECT original_path, width, height FROM assets WHERE id = ?')
        .get(bestFace.asset_id) as { original_path: string; width: number; height: number } | undefined;
    const detection = db.prepare("SELECT data FROM derived_results WHERE asset_id = ? AND task = 'face_detection'")
        .get(bestFace.asset_id) as { data: string } | undefined;
    if (!asset || !detection || !asset.width || !asset.height) {return null;}

    const data = JSON.parse(detection.data);
    const face = data.faces[bestFace.face_index];
    if (!face) {return null;}

    return {
        personId,
        originalPath: asset.original_path,
        width: asset.width,
        height: asset.height,
        box: face.box
    };
}

function calculateCrop(source: ThumbnailSource): { left: number; top: number; width: number; height: number } | null {
    const [x1, y1, x2, y2] = clampUnitBounds(source.box);
    const crop = {
        left: Math.floor(x1 * source.width),
        top: Math.floor(y1 * source.height),
        width: Math.floor((x2 - x1) * source.width),
        height: Math.floor((y2 - y1) * source.height)
    };
    if (crop.width <= 5 || crop.height <= 5) {return null;}
    return crop;
}

async function createThumbnailForCluster(
    db: ReturnType<DatabaseManager['getDb']>,
    previewsDir: string,
    personId: string
): Promise<void> {
    const source = getThumbnailSource(db, personId);
    if (!source) {return;}

    const crop = calculateCrop(source);
    if (!crop) {return;}

    const outPath = join(previewsDir, `person-${personId}.webp`);
    await sharp(source.originalPath)
        .rotate()
        .extract(crop)
        .resize(256, 256)
        .webp({ quality: 85 })
        .toFile(outPath);

    db.prepare('UPDATE people SET thumbnail_path = ? WHERE id = ?').run(outPath, personId);
}

export async function runFaceClusteringJob(
    jobId: string,
    dbManager: DatabaseManager,
    eventBus: EventBus,
    signal?: AbortSignal
) {
    const db = dbManager.getDb();
    const activeJobId = jobId || `cluster-batch-${Date.now()}`;
    eventBus.emit({ type: 'JobStarted', jobId: activeJobId, pipelineStage: 'analysis' });

    const allFaces = loadRecognisedFaces(db);
    if (allFaces.length === 0) {
        eventBus.emit({ type: 'JobCompleted', jobId: activeJobId, pipelineStage: 'analysis' });
        return;
    }

    const thresholdSetting = dbManager.getSetting('job_cluster_threshold');
    const threshold = thresholdSetting ? parseFloat(thresholdSetting) : 0.65;
    const activeClusters = await buildClusters(allFaces, threshold, signal);
    assignStableClusterIds(db, allFaces, activeClusters);
    persistClusters(db, eventBus, activeClusters, allFaces);
    applyManualOverrides(db);
    await generatePersonThumbnails(db, eventBus, activeClusters, activeJobId, signal);

    eventBus.emit({ type: 'JobCompleted', jobId: activeJobId, pipelineStage: 'analysis' });
}
