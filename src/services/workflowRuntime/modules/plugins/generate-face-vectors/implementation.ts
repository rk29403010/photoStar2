import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../../data/db';
import { ArcFaceRecognizer, type FaceEmbeddingService } from '../../../../faces/arcFaceRecognizer';
import { resolveStableFaceAtLegacyPosition } from '../../../../faces/manualFaceSemanticRepository';
import {
    normalizeStoredPhotoBox,
    storedPhotoBoxToUnitCorners,
    type StoredPhotoBox,
} from '../../../../faces/faceImageGeometry';
import type { FaceEmbeddingGenerated } from '../../../../events/types';
import {
    markAnalysisGenerationFailed,
    markAnalysisGenerationSuccessful,
    startAnalysisGeneration,
} from '../../../../machineAnalysis/analysisGenerationRepository';
import { storeFeatureVector } from '../../../../machineAnalysis/featureVectorRepository';
import type { ModuleDefinition, RuntimeModuleContext } from '../../../contracts';

const FACE_VECTOR_PROVIDER = 'onnx_arcface_r50';
const FACE_VECTOR_MODEL_KEY = 'arcface-w600k-r50';
const FACE_VECTOR_MODEL_VERSION = '1.0';
const FACE_VECTOR_FEATURE_KEY = 'face_embedding';
const FACE_VECTOR_PREPROCESSING_VERSION = 'arcface-112-box1.3-rgb-v1';
const FACE_VECTOR_CONFIG_HASH = sha256Text(JSON.stringify({
    featureKey: FACE_VECTOR_FEATURE_KEY,
    metric: 'cosine',
    normalization: 'none',
    preprocessingVersion: FACE_VECTOR_PREPROCESSING_VERSION,
}));

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

type ExecutionIdentity = {
    workflowRunId: string;
    stepRunId: string;
    subjectExecutionId: string;
};

type ProvenanceRuntimeModuleContext = RuntimeModuleContext & {
    stepRunId?: string;
    subjectExecutionId?: string;
};

function sha256Text(value: string): string {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function sha256File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
    });
}

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

function canonicalDetectionInput(faces: DetectionFace[]): string {
    return JSON.stringify(faces.map((face) => ({
        box: face.box ?? null,
        landmarks: face.landmarks ?? null,
    })));
}

function requireExecutionIdentity(context: ProvenanceRuntimeModuleContext): ExecutionIdentity {
    if (!context.stepRunId || !context.subjectExecutionId) {
        throw new Error('Face-vector generation requires workflow step and subject execution provenance.');
    }
    return {
        workflowRunId: context.runId,
        stepRunId: context.stepRunId,
        subjectExecutionId: context.subjectExecutionId,
    };
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

function deleteLegacyEmbeddings(
    db: ReturnType<DatabaseManager['getDb']>,
    assetId: string,
): void {
    db.prepare("DELETE FROM derived_results WHERE asset_id = ? AND task = 'face_recognition'").run(assetId);
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

function startFaceVectorGeneration(params: {
    db: ReturnType<DatabaseManager['getDb']>;
    assetId: string;
    execution: ExecutionIdentity;
    inputFingerprint: string;
    modelArtifactChecksum: string | null;
}) {
    const idempotencyKey = sha256Text(JSON.stringify({
        scopeKey: `face-vectors:${params.assetId}`,
        ...params.execution,
        inputFingerprint: params.inputFingerprint,
        configHash: FACE_VECTOR_CONFIG_HASH,
    }));
    return startAnalysisGeneration(params.db, {
        scopeKey: `face-vectors:${params.assetId}`,
        workflowRunId: params.execution.workflowRunId,
        stepRunId: params.execution.stepRunId,
        subjectExecutionId: params.execution.subjectExecutionId,
        inputFingerprint: params.inputFingerprint,
        provider: FACE_VECTOR_PROVIDER,
        modelKey: FACE_VECTOR_MODEL_KEY,
        modelVersion: FACE_VECTOR_MODEL_VERSION,
        modelArtifactChecksum: params.modelArtifactChecksum,
        preprocessingVersion: FACE_VECTOR_PREPROCESSING_VERSION,
        configHash: FACE_VECTOR_CONFIG_HASH,
        idempotencyKey,
    });
}

function storeGenerationVectors(params: {
    db: ReturnType<DatabaseManager['getDb']>;
    generationId: string;
    assetId: string;
    embeddings: Array<number[] | null>;
}): number {
    let failedFaces = 0;
    params.embeddings.forEach((embedding, faceIndex) => {
        if (!embedding) {
            return;
        }
        try {
            const stableFace = resolveStableFaceAtLegacyPosition(params.db, params.assetId, faceIndex);
            storeFeatureVector(params.db, {
                subjectEntityId: stableFace.faceId,
                analysisGenerationId: params.generationId,
                featureKey: FACE_VECTOR_FEATURE_KEY,
                normalization: 'none',
                metric: 'cosine',
                values: embedding,
            });
        } catch {
            failedFaces += 1;
        }
    });
    return failedFaces;
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
            const assetId = context.subject.subjectId;
            const execution = requireExecutionIdentity(context as ProvenanceRuntimeModuleContext);
            const asset = loadAsset(db, assetId);
            const faces = loadDetectedFaces(db, assetId);
            const detectionFingerprint = sha256Text(canonicalDetectionInput(faces));

            if (faces.length === 0) {
                const generation = startFaceVectorGeneration({
                    db,
                    assetId,
                    execution,
                    inputFingerprint: detectionFingerprint,
                    modelArtifactChecksum: null,
                });
                if (generation.status === 'running') {
                    markAnalysisGenerationSuccessful(db, generation.id);
                }
                deleteLegacyEmbeddings(db, assetId);
                deleteRecognitionIssues(db, assetId);
                return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
            }

            if (!asset?.original_path || !existsSync(asset.original_path)) {
                recordRecognitionIssue(db, assetId, 'Original asset file is missing; face recognition skipped.');
                return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
            }

            if (!embeddingService.isAvailable()) {
                recordRecognitionIssue(db, assetId, getUnavailableMessage(embeddingService));
                return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
            }

            const modelPath = embeddingService.getModelPath();
            if (!modelPath || !existsSync(modelPath)) {
                recordRecognitionIssue(db, assetId, getUnavailableMessage(embeddingService));
                return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
            }

            const [assetChecksum, modelArtifactChecksum] = await Promise.all([
                sha256File(asset.original_path),
                sha256File(modelPath),
            ]);
            const inputFingerprint = sha256Text(JSON.stringify({
                assetChecksum,
                detectionFingerprint,
            }));
            const generation = startFaceVectorGeneration({
                db,
                assetId,
                execution,
                inputFingerprint,
                modelArtifactChecksum,
            });
            if (generation.status === 'successful') {
                deleteLegacyEmbeddings(db, assetId);
                deleteRecognitionIssues(db, assetId);
                return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
            }
            if (generation.status !== 'running') {
                recordRecognitionIssue(db, assetId, `ArcFace generation '${generation.id}' is ${generation.status}; retry requires a new execution.`);
                return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
            }

            const { embeddings, failedFaces: inferenceFailures } = await buildEmbeddings({
                assetId,
                assetPath: asset.original_path,
                faces,
                embeddingService,
                eventSink: options.eventBus,
            });
            const persistenceFailures = storeGenerationVectors({
                db,
                generationId: generation.id,
                assetId,
                embeddings,
            });
            const failedFaces = inferenceFailures + persistenceFailures;

            if (failedFaces > 0) {
                markAnalysisGenerationFailed(db, generation.id);
                recordRecognitionIssue(
                    db,
                    assetId,
                    `ArcFace recognition failed for ${failedFaces} detected face${failedFaces === 1 ? '' : 's'}; the previous successful vector generation remains active.`,
                );
            } else {
                markAnalysisGenerationSuccessful(db, generation.id);
                deleteLegacyEmbeddings(db, assetId);
                deleteRecognitionIssues(db, assetId);
            }

            return { outputs: [{ kind: 'artifact', artifactType: 'face_vector', subjectType: 'asset' }] };
        },
    };
}
