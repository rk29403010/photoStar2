import { existsSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../../data/db';
import { ArcFaceRecognizer, type FaceEmbeddingService } from '../../../../faces/arcFaceRecognizer';
import {
    normalizeStoredPhotoBox,
    storedPhotoBoxToUnitCorners,
    type StoredPhotoBox,
} from '../../../../faces/faceImageGeometry';
import type { FaceEmbeddingGenerated } from '../../../../events/types';
import type { ModuleDefinition } from '../../../contracts';

export type GenerateFaceVectorsModuleOptions = {
    dbManager: DatabaseManager;
    eventBus?: {
        emit: (event: FaceEmbeddingGenerated) => void;
    };
    embeddingService?: FaceEmbeddingService;
}

type AssetRow = {
    original_path: string;
};

type DetectionFace = {
    id?: string;
    box?: StoredPhotoBox | number[];
    landmarks?: Array<{ x: number; y: number }>;
};

function loadAsset(
    db: ReturnType<DatabaseManager['getDb']>,
    assetId: string,
): AssetRow | undefined {
    return db.prepare('SELECT original_path FROM assets WHERE id = ?').get(assetId) as AssetRow | undefined;
}

function loadDetectedFaces(
    db: ReturnType<DatabaseManager['getDb']>,
    assetId: string,
): DetectionFace[] {
    const detection = db.prepare(
        "SELECT data FROM derived_results WHERE asset_id = ? AND task = 'face_detection'"
    ).get(assetId) as { data: string } | undefined;

    if (!detection) {
        return [];
    }

    try {
        const parsed = JSON.parse(detection.data) as { faces?: DetectionFace[] };
        return Array.isArray(parsed.faces) ? parsed.faces : [];
    } catch {
        return [];
    }
}

function deleteRecognitionIssues(
    db: ReturnType<DatabaseManager['getDb']>,
    assetId: string,
): void {
    db.prepare("DELETE FROM processing_issues WHERE asset_id = ? AND task = 'recognition'").run(assetId);
}

function recordRecognitionIssue(
    db: ReturnType<DatabaseManager['getDb']>,
    assetId: string,
    message: string,
): void {
    deleteRecognitionIssues(db, assetId);
    db.prepare(`
        INSERT INTO processing_issues (id, asset_id, task, severity, message)
        VALUES (?, ?, 'recognition', 'warning', ?)
    `).run(uuidv4(), assetId, message);
}

function persistEmbeddings(
    db: ReturnType<DatabaseManager['getDb']>,
    assetId: string,
    embeddings: Array<number[] | null>,
): void {
    db.prepare("DELETE FROM derived_results WHERE asset_id = ? AND task = 'face_recognition'").run(assetId);
    db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
        VALUES (?, ?, 'face_recognition', 'onnx_arcface_r50', '1.0', ?)
    `).run(uuidv4(), assetId, JSON.stringify({ embeddings }));
}

async function buildEmbeddings(params: {
    assetId: string;
    assetPath: string;
    faces: DetectionFace[];
    embeddingService: FaceEmbeddingService;
    eventSink?: { emit: (event: FaceEmbeddingGenerated) => void };
}): Promise<{ embeddings: Array<number[] | null>; failedFaces: number }> {
    const embeddings: Array<number[] | null> = [];
    let failedFaces = 0;

    for (let index = 0; index < params.faces.length; index += 1) {
        const face = params.faces[index];
        if (!face.box || !face.landmarks) {
            embeddings.push(null);
            continue;
        }

        try {
            const storedBox = normalizeStoredPhotoBox(face.box);
            if (!storedBox) {
                failedFaces += 1;
                embeddings.push(null);
                continue;
            }

            const embedding = await params.embeddingService.computeEmbedding(
                params.assetPath,
                storedPhotoBoxToUnitCorners(storedBox),
            );
            if (embedding) {
                params.eventSink?.emit({
                    type: 'FaceEmbeddingGenerated',
                    mediaId: params.assetId,
                    faceId: face.id ?? `${params.assetId}:${index}`,
                });
            } else {
                failedFaces += 1;
            }
            embeddings.push(embedding);
        } catch {
            failedFaces += 1;
            embeddings.push(null);
        }
    }

    return { embeddings, failedFaces };
}

function getUnavailableMessage(embeddingService: FaceEmbeddingService): string {
    const modelPath = embeddingService.getModelPath();
    if (modelPath) {
        return `ArcFace model is unavailable at '${modelPath}'.`;
    }
    return 'ArcFace model not found. Run tooling/scripts/core/download_arcface_model.cjs to install w600k_r50.onnx.';
}

export function createGenerateFaceVectorsModule(options: GenerateFaceVectorsModuleOptions): ModuleDefinition {
    const embeddingService = options.embeddingService ?? new ArcFaceRecognizer();

    return {
        id: 'runtime.generate_face_vectors',
        version: 1,
        capability: 'derive',
        accepts: ['asset'],
        produces: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }],
        run: async (context) => {
            const db = options.dbManager.getDb();
            const asset = loadAsset(db, context.subject.subjectId);
            const faces = loadDetectedFaces(db, context.subject.subjectId);

            if (faces.length === 0) {
                deleteRecognitionIssues(db, context.subject.subjectId);
                persistEmbeddings(db, context.subject.subjectId, []);
                return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
            }

            if (!asset?.original_path || !existsSync(asset.original_path)) {
                recordRecognitionIssue(db, context.subject.subjectId, 'Original asset file is missing; face recognition skipped.');
                return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
            }

            if (!embeddingService.isAvailable()) {
                recordRecognitionIssue(db, context.subject.subjectId, getUnavailableMessage(embeddingService));
                return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
            }

            const { embeddings, failedFaces } = await buildEmbeddings({
                assetId: context.subject.subjectId,
                assetPath: asset.original_path,
                faces,
                embeddingService,
                eventSink: options.eventBus,
            });

            persistEmbeddings(db, context.subject.subjectId, embeddings);
            if (failedFaces > 0) {
                recordRecognitionIssue(
                    db,
                    context.subject.subjectId,
                    `ArcFace recognition failed for ${failedFaces} detected face${failedFaces === 1 ? '' : 's'}.`,
                );
            } else {
                deleteRecognitionIssues(db, context.subject.subjectId);
            }

            return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
        },
    };
}
