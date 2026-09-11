import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import type { DomainEvent } from '../events/types';
import { cosineSimilarity } from '../math-utils';
import { decodeFeatureVector } from '../machineAnalysis/featureVectorRepository';
import { applyStableManualFaceDecisionProjection, resolveStableFaceById } from './manualFaceSemanticRepository';
import {
    normalizeStoredPhotoBox,
    storedPhotoBoxToPixelCrop,
    type StoredPhotoBox,
} from './faceImageGeometry';

type FaceRef = { assetId: string; faceIndex: number; embedding: number[] };
type Cluster = { id: string; faces: number[]; centroid: number[] };

type ActiveVectorRow = {
    face_id: string;
    vector_blob: Buffer;
    dimensions: number;
};

export function loadRecognisedFaces(db: ReturnType<DatabaseManager['getDb']>): FaceRef[] {
    const rows = db.prepare(`
        SELECT
            vector.subject_entity_id AS face_id,
            vector.vector_blob,
            vector.dimensions
        FROM feature_vectors vector
        JOIN analysis_generations generation
          ON generation.id = vector.analysis_generation_id
        JOIN analysis_generation_heads head
          ON head.active_generation_id = generation.id
        WHERE vector.feature_key = 'face_embedding'
          AND generation.status = 'successful'
        ORDER BY vector.subject_entity_id ASC
    `).all() as ActiveVectorRow[];

    const faces: FaceRef[] = [];
    for (const row of rows) {
        try {
            const position = resolveStableFaceById(db, row.face_id);
            faces.push({
                assetId: position.assetId,
                faceIndex: position.faceIndex,
                embedding: decodeFeatureVector(row.vector_blob, row.dimensions),
            });
        } catch {
            // An active vector whose stable Face no longer has a current detector position
            // is retained as evidence but cannot participate in the transitional cluster projection.
        }
    }
    return faces;
}

function hasOnlyLegacyRecognitionData(db: ReturnType<DatabaseManager['getDb']>): boolean {
    const activeGenerationCount = (db.prepare(`
        SELECT COUNT(*) AS count
        FROM analysis_generation_heads
        WHERE scope_key LIKE 'face-vectors:%'
    `).get() as { count: number }).count;
    if (activeGenerationCount > 0) {
        return false;
    }
    const legacyCount = (db.prepare(`
        SELECT COUNT(*) AS count
        FROM derived_results
        WHERE task = 'face_recognition'
    `).get() as { count: number }).count;
    return legacyCount > 0;
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
        INSERT INTO face_assignments (asset_id, face_index, person_id, confidence, is_suggested)
        VALUES (?, ?, ?, ?, ?)
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
                const confidence = cosineSimilarity(face.embedding, cluster.centroid);
                const isSuggested = confidence < 0.72 ? 1 : 0;
                insertAssignment.run(
                    face.assetId,
                    face.faceIndex,
                    cluster.id,
                    confidence,
                    isSuggested
                );
            }

            eventSink?.emit({ type: 'FaceClusteringUpdated', clusterId: cluster.id });
        }

        db.prepare('DELETE FROM people WHERE id NOT IN (SELECT DISTINCT person_id FROM face_assignments)').run();
    })();
}

function expandStoredPhotoBox(box: StoredPhotoBox, multiplier: number): StoredPhotoBox | null {
    const expandedWidth = box.width * multiplier;
    const expandedHeight = box.height * multiplier;
    const expandedX = box.x - ((expandedWidth - box.width) / 2);
    const expandedY = box.y - ((expandedHeight - box.height) / 2);

    return normalizeStoredPhotoBox({
        x: expandedX,
        y: expandedY,
        width: expandedWidth,
        height: expandedHeight,
    });
}

type ThumbnailSource = {
    assetPath: string;
    width: number;
    height: number;
    box: StoredPhotoBox;
};

function loadThumbnailSource(
    db: ReturnType<DatabaseManager['getDb']>,
    personId: string,
): ThumbnailSource | null {
    const bestFace = db.prepare(`
        SELECT asset_id, face_index
        FROM face_assignments
        WHERE person_id = ? AND is_suggested = 0
        ORDER BY confidence DESC
        LIMIT 1
    `).get(personId) as { asset_id: string; face_index: number } | undefined;
    if (!bestFace) {
        return null;
    }

    const asset = db.prepare('SELECT original_path, width, height FROM assets WHERE id = ?')
        .get(bestFace.asset_id) as { original_path: string; width: number; height: number } | undefined;
    const detection = db.prepare("SELECT data FROM derived_results WHERE asset_id = ? AND task = 'face_detection'")
        .get(bestFace.asset_id) as { data: string } | undefined;
    if (!asset?.width || !asset.height || !detection) {
        return null;
    }

    const face = (JSON.parse(detection.data) as { faces?: Array<{ box: StoredPhotoBox | number[] }> }).faces?.[bestFace.face_index];
    const normalizedBox = normalizeStoredPhotoBox(face?.box);
    if (!normalizedBox) {
        return null;
    }

    return {
        assetPath: asset.original_path,
        width: asset.width,
        height: asset.height,
        box: normalizedBox,
    };
}

function buildPersonThumbnailCrop(source: ThumbnailSource) {
    const expandedBox = expandStoredPhotoBox(source.box, 1.5);
    if (!expandedBox) {
        return null;
    }

    const crop = storedPhotoBoxToPixelCrop(expandedBox, {
        width: source.width,
        height: source.height,
    });
    if (crop.width <= 5 || crop.height <= 5) {
        return null;
    }

    return crop;
}

async function createThumbnailForPerson(
    db: ReturnType<DatabaseManager['getDb']>,
    previewsDir: string,
    personId: string,
): Promise<void> {
    const thumbnailSource = loadThumbnailSource(db, personId);
    if (!thumbnailSource) {
        return;
    }

    const crop = buildPersonThumbnailCrop(thumbnailSource);
    if (!crop) {
        return;
    }

    const outputPath = join(previewsDir, `person-${personId}.webp`);
    await sharp(thumbnailSource.assetPath)
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
        if (hasOnlyLegacyRecognitionData(db)) {
            return;
        }
        db.prepare('DELETE FROM face_assignments').run();
        db.prepare('DELETE FROM people').run();
        return;
    }

    const thresholdSetting = params.dbManager.getSetting('job_cluster_threshold');
    const threshold = thresholdSetting ? Number.parseFloat(thresholdSetting) : 0.6;
    const clusters = buildClusters(faces, Number.isFinite(threshold) ? threshold : 0.6);
    assignStableClusterIds(db, faces, clusters);
    persistClusters(db, clusters, faces, params.eventSink);
    applyStableManualFaceDecisionProjection(db);
    await generatePersonThumbnails(db, clusters);
}
