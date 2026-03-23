import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import type { DomainEvent } from '../events/types';
import { cosineSimilarity } from '../math-utils';

type FaceRef = { assetId: string; faceIndex: number; embedding: number[] };
type Cluster = { id: string; faces: number[]; centroid: number[] };

function loadRecognisedFaces(db: ReturnType<DatabaseManager['getDb']>): FaceRef[] {
    const rows = db.prepare(`
        SELECT asset_id, data
        FROM derived_results
        WHERE task = 'face_recognition'
    `).all() as Array<{ asset_id: string; data: string }>;

    const faces: FaceRef[] = [];
    for (const row of rows) {
        try {
            const parsed = JSON.parse(row.data) as { embeddings?: Array<number[] | null> };
            if (!Array.isArray(parsed.embeddings)) {
                continue;
            }
            parsed.embeddings.forEach((embedding, faceIndex) => {
                if (!embedding) {
                    return;
                }
                faces.push({ assetId: row.asset_id, faceIndex, embedding });
            });
        } catch {
            // ignore bad legacy rows
        }
    }
    return faces;
}

function buildClusters(allFaces: FaceRef[], threshold: number): Cluster[] {
    const activeClusters: Cluster[] = [];
    for (let index = 0; index < allFaces.length; index += 1) {
        const face = allFaces[index];
        let bestMatch: Cluster | null = null;
        let bestSimilarity = -1;

        for (const cluster of activeClusters) {
            const similarity = cosineSimilarity(face.embedding, cluster.centroid);
            if (similarity > threshold && similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = cluster;
            }
        }

        if (!bestMatch) {
            activeClusters.push({ id: uuidv4(), faces: [index], centroid: [...face.embedding] });
            continue;
        }

        bestMatch.faces.push(index);
        const count = bestMatch.faces.length;
        for (let centroidIndex = 0; centroidIndex < bestMatch.centroid.length; centroidIndex += 1) {
            bestMatch.centroid[centroidIndex] = (
                (bestMatch.centroid[centroidIndex] * (count - 1)) + face.embedding[centroidIndex]
            ) / count;
        }
    }
    return activeClusters;
}

function assignStableClusterIds(
    db: ReturnType<DatabaseManager['getDb']>,
    allFaces: FaceRef[],
    activeClusters: Cluster[],
): void {
    const existingAssignments = db.prepare(
        'SELECT asset_id, face_index, person_id FROM face_assignments'
    ).all() as Array<{ asset_id: string; face_index: number; person_id: string }>;
    const previousAssignments = new Map(existingAssignments.map((row) => [`${row.asset_id}_${row.face_index}`, row.person_id]));

    for (const cluster of activeClusters) {
        const votes = new Map<string, number>();
        for (const faceIndex of cluster.faces) {
            const face = allFaces[faceIndex];
            const previousPersonId = previousAssignments.get(`${face.assetId}_${face.faceIndex}`);
            if (previousPersonId) {
                votes.set(previousPersonId, (votes.get(previousPersonId) || 0) + 1);
            }
        }

        let winningPersonId: string | null = null;
        let maxVotes = 0;
        for (const [personId, voteCount] of votes.entries()) {
            if (voteCount > maxVotes) {
                winningPersonId = personId;
                maxVotes = voteCount;
            }
        }

        cluster.id = winningPersonId || uuidv4();
    }
}

function persistClusters(
    db: ReturnType<DatabaseManager['getDb']>,
    activeClusters: Cluster[],
    allFaces: FaceRef[],
    eventSink?: { emit: (event: DomainEvent) => void },
): void {
    const existingPeopleCount = (db.prepare('SELECT COUNT(*) AS count FROM people').get() as { count: number } | undefined)?.count || 0;
    let newPersonCounter = existingPeopleCount;

    const insertPerson = db.prepare('INSERT OR IGNORE INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)');
    const insertAssignment = db.prepare(`
        INSERT INTO face_assignments (asset_id, face_index, person_id, confidence)
        VALUES (?, ?, ?, ?)
    `);
    const deleteAssignments = db.prepare('DELETE FROM face_assignments');

    db.transaction(() => {
        deleteAssignments.run();
        const seenPeople = new Set<string>();

        for (const cluster of activeClusters) {
            if (!seenPeople.has(cluster.id)) {
                const exists = Boolean(db.prepare('SELECT id FROM people WHERE id = ?').get(cluster.id));
                if (!exists) {
                    newPersonCounter += 1;
                    insertPerson.run(cluster.id, `Person ${newPersonCounter}`, null);
                }
                seenPeople.add(cluster.id);
            }

            for (const faceIndex of cluster.faces) {
                const face = allFaces[faceIndex];
                insertAssignment.run(
                    face.assetId,
                    face.faceIndex,
                    cluster.id,
                    cosineSimilarity(face.embedding, cluster.centroid),
                );
            }

            eventSink?.emit({ type: 'FaceClusteringUpdated', clusterId: cluster.id });
        }

        db.prepare('DELETE FROM people WHERE id NOT IN (SELECT DISTINCT person_id FROM face_assignments)').run();
    })();
}

function applyManualOverrides(db: ReturnType<DatabaseManager['getDb']>): void {
    db.transaction(() => {
        const isolations = db.prepare(`
            SELECT a.id AS asset_id, m.face_index
            FROM manual_face_isolations m
            JOIN assets a ON a.original_path = m.original_path
        `).all() as Array<{ asset_id: string; face_index: number }>;

        for (const isolation of isolations) {
            const newPersonId = uuidv4();
            db.prepare('INSERT INTO people (id, name, thumbnail_path) VALUES (?, ?, ?)').run(newPersonId, 'Unknown Person', null);
            db.prepare('UPDATE face_assignments SET person_id = ? WHERE asset_id = ? AND face_index = ?')
                .run(newPersonId, isolation.asset_id, isolation.face_index);
        }

        const names = db.prepare(`
            SELECT a.id AS asset_id, m.face_index, m.name
            FROM manual_face_names m
            JOIN assets a ON a.original_path = m.original_path
        `).all() as Array<{ asset_id: string; face_index: number; name: string }>;

        const canonicalPeopleByName = new Map<string, string>();
        for (const row of names) {
            const assignment = db.prepare(
                'SELECT person_id FROM face_assignments WHERE asset_id = ? AND face_index = ?'
            ).get(row.asset_id, row.face_index) as { person_id: string } | undefined;
            if (!assignment) {
                continue;
            }

            if (!canonicalPeopleByName.has(row.name)) {
                canonicalPeopleByName.set(row.name, assignment.person_id);
                db.prepare('UPDATE people SET name = ? WHERE id = ?').run(row.name, assignment.person_id);
                continue;
            }

            const canonicalPersonId = canonicalPeopleByName.get(row.name)!;
            if (canonicalPersonId !== assignment.person_id) {
                db.prepare('UPDATE face_assignments SET person_id = ? WHERE person_id = ?')
                    .run(canonicalPersonId, assignment.person_id);
                db.prepare('DELETE FROM people WHERE id = ?').run(assignment.person_id);
            }
        }
    })();
}

function clampUnitBounds(box: number[]): [number, number, number, number] {
    const width = box[2] - box[0];
    const height = box[3] - box[1];
    const centerX = (box[0] + box[2]) / 2;
    const centerY = (box[1] + box[3]) / 2;
    const cropSize = Math.max(width, height) * 1.5;

    let x1 = centerX - cropSize / 2;
    let y1 = centerY - cropSize / 2;
    let x2 = centerX + cropSize / 2;
    let y2 = centerY + cropSize / 2;

    if (x1 < 0) {
        x2 -= x1;
        x1 = 0;
    }
    if (y1 < 0) {
        y2 -= y1;
        y1 = 0;
    }
    if (x2 > 1) {
        x1 -= x2 - 1;
        x2 = 1;
    }
    if (y2 > 1) {
        y1 -= y2 - 1;
        y2 = 1;
    }

    return [Math.max(0, x1), Math.max(0, y1), Math.min(1, x2), Math.min(1, y2)];
}

async function createThumbnailForPerson(
    db: ReturnType<DatabaseManager['getDb']>,
    previewsDir: string,
    personId: string,
): Promise<void> {
    const bestFace = db.prepare(`
        SELECT asset_id, face_index
        FROM face_assignments
        WHERE person_id = ?
        ORDER BY confidence DESC
        LIMIT 1
    `).get(personId) as { asset_id: string; face_index: number } | undefined;
    if (!bestFace) {
        return;
    }

    const asset = db.prepare('SELECT original_path, width, height FROM assets WHERE id = ?')
        .get(bestFace.asset_id) as { original_path: string; width: number; height: number } | undefined;
    const detection = db.prepare("SELECT data FROM derived_results WHERE asset_id = ? AND task = 'face_detection'")
        .get(bestFace.asset_id) as { data: string } | undefined;
    if (!asset || !asset.width || !asset.height || !detection) {
        return;
    }

    const face = (JSON.parse(detection.data) as { faces?: Array<{ box: number[] }> }).faces?.[bestFace.face_index];
    if (!face) {
        return;
    }

    const [x1, y1, x2, y2] = clampUnitBounds(face.box);
    const crop = {
        left: Math.floor(x1 * asset.width),
        top: Math.floor(y1 * asset.height),
        width: Math.floor((x2 - x1) * asset.width),
        height: Math.floor((y2 - y1) * asset.height),
    };
    if (crop.width <= 5 || crop.height <= 5) {
        return;
    }

    const outputPath = join(previewsDir, `person-${personId}.webp`);
    await sharp(asset.original_path)
        .rotate()
        .extract(crop)
        .resize(256, 256)
        .webp({ quality: 85 })
        .toFile(outputPath);

    db.prepare('UPDATE people SET thumbnail_path = ? WHERE id = ?').run(outputPath, personId);
}

async function generatePersonThumbnails(
    db: ReturnType<DatabaseManager['getDb']>,
    activeClusters: Cluster[],
): Promise<void> {
    const libraryDir = dirname(db.name);
    const previewsDir = join(libraryDir, 'previews');
    if (!existsSync(previewsDir)) {
        mkdirSync(previewsDir, { recursive: true });
    }

    for (const cluster of activeClusters) {
        await createThumbnailForPerson(db, previewsDir, cluster.id);
    }
}

export async function resolvePeopleAssignments(params: {
    dbManager: DatabaseManager;
    eventSink?: { emit: (event: DomainEvent) => void };
}): Promise<void> {
    const db = params.dbManager.getDb();
    const faces = loadRecognisedFaces(db);
    if (faces.length === 0) {
        db.prepare('DELETE FROM face_assignments').run();
        db.prepare('DELETE FROM people').run();
        return;
    }

    const thresholdSetting = params.dbManager.getSetting('job_cluster_threshold');
    const threshold = thresholdSetting ? Number.parseFloat(thresholdSetting) : 0.65;
    const clusters = buildClusters(faces, Number.isFinite(threshold) ? threshold : 0.65);
    assignStableClusterIds(db, faces, clusters);
    persistClusters(db, clusters, faces, params.eventSink);
    applyManualOverrides(db);
    await generatePersonThumbnails(db, clusters);
}
