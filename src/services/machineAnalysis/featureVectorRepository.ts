import { randomUUID } from 'node:crypto';
import type { DatabaseManager } from '../../data/db';
import { getAnalysisGeneration } from './analysisGenerationRepository';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type FeatureVectorNormalization = 'none' | 'l2';
export type FeatureVectorMetric = 'cosine' | 'euclidean' | 'dot_product';

export type FeatureVector = {
    id: string;
    subjectEntityId: string;
    analysisGenerationId: string;
    featureKey: string;
    dimensions: number;
    normalization: FeatureVectorNormalization;
    metric: FeatureVectorMetric;
    values: number[];
    provenance: {
        inputFingerprint: string;
        provider: string;
        modelKey: string;
        modelVersion: string;
        modelArtifactChecksum: string | null;
        preprocessingVersion: string;
        configHash: string;
    };
    createdAt: string;
};

export type StoreFeatureVectorInput = {
    subjectEntityId: string;
    analysisGenerationId: string;
    featureKey: string;
    normalization: FeatureVectorNormalization;
    metric: FeatureVectorMetric;
    values: readonly number[];
};

type FeatureVectorRow = {
    id: string;
    subject_entity_id: string;
    analysis_generation_id: string;
    feature_key: string;
    dimensions: number;
    normalization: FeatureVectorNormalization;
    metric: FeatureVectorMetric;
    vector_blob: Buffer;
    created_at: string;
};

const L2_TOLERANCE = 0.0001;

function assertFiniteVector(values: readonly number[]): void {
    if (values.length === 0) {
        throw new Error('Feature vectors must contain at least one dimension.');
    }
    if (values.some((value) => !Number.isFinite(value))) {
        throw new Error('Feature vectors may contain only finite values.');
    }
}

function assertNormalization(values: readonly number[], normalization: FeatureVectorNormalization): void {
    if (normalization !== 'l2') {
        return;
    }
    const magnitude = Math.sqrt(values.reduce((sum, value) => sum + (value * value), 0));
    if (Math.abs(magnitude - 1) > L2_TOLERANCE) {
        throw new Error('Feature vector declared as l2-normalized does not have unit length.');
    }
}

export function encodeFeatureVector(values: readonly number[]): Buffer {
    assertFiniteVector(values);
    const buffer = Buffer.allocUnsafe(values.length * Float32Array.BYTES_PER_ELEMENT);
    for (let index = 0; index < values.length; index += 1) {
        buffer.writeFloatLE(values[index], index * Float32Array.BYTES_PER_ELEMENT);
    }
    return buffer;
}

export function decodeFeatureVector(blob: Buffer, dimensions: number): number[] {
    const expectedLength = dimensions * Float32Array.BYTES_PER_ELEMENT;
    if (!Number.isInteger(dimensions) || dimensions <= 0 || blob.length !== expectedLength) {
        throw new Error(`Malformed feature vector BLOB: expected ${expectedLength} bytes for ${dimensions} dimensions, received ${blob.length}.`);
    }
    const values: number[] = [];
    for (let offset = 0; offset < blob.length; offset += Float32Array.BYTES_PER_ELEMENT) {
        const value = blob.readFloatLE(offset);
        if (!Number.isFinite(value)) {
            throw new Error('Malformed feature vector BLOB contains a non-finite value.');
        }
        values.push(value);
    }
    return values;
}

function loadFeatureVectorRow(
    db: DbHandle,
    subjectEntityId: string,
    analysisGenerationId: string,
    featureKey: string,
): FeatureVectorRow | null {
    return (db.prepare(`
        SELECT id, subject_entity_id, analysis_generation_id, feature_key,
               dimensions, normalization, metric, vector_blob, created_at
        FROM feature_vectors
        WHERE subject_entity_id = ?
          AND analysis_generation_id = ?
          AND feature_key = ?
    `).get(subjectEntityId, analysisGenerationId, featureKey) as FeatureVectorRow | undefined) ?? null;
}

function mapFeatureVector(db: DbHandle, row: FeatureVectorRow): FeatureVector {
    const generation = getAnalysisGeneration(db, row.analysis_generation_id);
    if (!generation) {
        throw new Error(`Feature vector '${row.id}' references unknown analysis generation '${row.analysis_generation_id}'.`);
    }
    const values = decodeFeatureVector(row.vector_blob, row.dimensions);
    assertNormalization(values, row.normalization);
    return {
        id: row.id,
        subjectEntityId: row.subject_entity_id,
        analysisGenerationId: row.analysis_generation_id,
        featureKey: row.feature_key,
        dimensions: row.dimensions,
        normalization: row.normalization,
        metric: row.metric,
        values,
        provenance: {
            inputFingerprint: generation.inputFingerprint,
            provider: generation.provider,
            modelKey: generation.modelKey,
            modelVersion: generation.modelVersion,
            modelArtifactChecksum: generation.modelArtifactChecksum,
            preprocessingVersion: generation.preprocessingVersion,
            configHash: generation.configHash,
        },
        createdAt: row.created_at,
    };
}

function assertSubjectExists(db: DbHandle, subjectEntityId: string): void {
    const subject = db.prepare('SELECT id FROM semantic_entities WHERE id = ?').get(subjectEntityId);
    if (!subject) {
        throw new Error(`Unknown feature-vector subject '${subjectEntityId}'.`);
    }
}

function assertIdempotentMatch(
    row: FeatureVectorRow,
    input: StoreFeatureVectorInput,
    encoded: Buffer,
): void {
    const matches = row.dimensions === input.values.length
        && row.normalization === input.normalization
        && row.metric === input.metric
        && row.vector_blob.equals(encoded);
    if (!matches) {
        throw new Error('Feature-vector identity was reused with different vector data or metadata.');
    }
}

export function storeFeatureVector(db: DbHandle, input: StoreFeatureVectorInput): FeatureVector {
    assertFiniteVector(input.values);
    assertNormalization(input.values, input.normalization);
    const encoded = encodeFeatureVector(input.values);

    return db.transaction(() => {
        assertSubjectExists(db, input.subjectEntityId);
        const generation = getAnalysisGeneration(db, input.analysisGenerationId);
        if (!generation) {
            throw new Error(`Unknown analysis generation '${input.analysisGenerationId}'.`);
        }
        if (generation.status !== 'running') {
            throw new Error(`Feature vectors can only be written to a running generation, not '${generation.status}'.`);
        }

        const existing = loadFeatureVectorRow(
            db,
            input.subjectEntityId,
            input.analysisGenerationId,
            input.featureKey,
        );
        if (existing) {
            assertIdempotentMatch(existing, input, encoded);
            return mapFeatureVector(db, existing);
        }

        const id = randomUUID();
        db.prepare(`
            INSERT INTO feature_vectors (
                id, subject_entity_id, analysis_generation_id, feature_key,
                dimensions, normalization, metric, vector_blob
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            input.subjectEntityId,
            input.analysisGenerationId,
            input.featureKey,
            input.values.length,
            input.normalization,
            input.metric,
            encoded,
        );
        return mapFeatureVector(
            db,
            loadFeatureVectorRow(db, input.subjectEntityId, input.analysisGenerationId, input.featureKey)!,
        );
    })();
}

export function getFeatureVector(
    db: DbHandle,
    subjectEntityId: string,
    analysisGenerationId: string,
    featureKey: string,
): FeatureVector | null {
    const row = loadFeatureVectorRow(db, subjectEntityId, analysisGenerationId, featureKey);
    return row ? mapFeatureVector(db, row) : null;
}
