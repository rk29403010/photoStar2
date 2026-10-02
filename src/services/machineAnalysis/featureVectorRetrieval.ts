import type { DatabaseManager } from '../../data/db';
import {
    decodeFeatureVector,
    type FeatureVectorMetric,
    type FeatureVectorNormalization,
} from './featureVectorRepository';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type ActiveVectorRow = {
    subject_entity_id: string;
    analysis_generation_id: string;
    dimensions: number;
    normalization: FeatureVectorNormalization;
    metric: FeatureVectorMetric;
    vector_blob: Buffer;
    model_key: string;
    model_version: string;
    preprocessing_version: string;
    config_hash: string;
};

export type ActiveFeatureVector = {
    subjectEntityId: string;
    analysisGenerationId: string;
    dimensions: number;
    normalization: FeatureVectorNormalization;
    metric: FeatureVectorMetric;
    values: number[];
};

export type FeatureVectorCandidate = {
    subjectEntityId: string;
    analysisGenerationId: string;
    distance: number;
};

function activeVectorSql(extraWhere = ''): string {
    return `
        SELECT vector.subject_entity_id, vector.analysis_generation_id,
               vector.dimensions, vector.normalization, vector.metric, vector.vector_blob,
               generation.model_key, generation.model_version,
               generation.preprocessing_version, generation.config_hash
        FROM feature_vectors vector
        JOIN analysis_generations generation
          ON generation.id = vector.analysis_generation_id
        JOIN analysis_generation_heads head
          ON head.active_generation_id = generation.id
        WHERE vector.feature_key = ?
          AND generation.status = 'successful'
          ${extraWhere}
    `;
}

function getActiveVectorRow(db: DbHandle, subjectEntityId: string, featureKey: string): ActiveVectorRow | null {
    return (db.prepare(activeVectorSql('AND vector.subject_entity_id = ?'))
        .get(featureKey, subjectEntityId) as ActiveVectorRow | undefined) ?? null;
}

export function getActiveFeatureVector(
    db: DbHandle,
    subjectEntityId: string,
    featureKey: string,
): ActiveFeatureVector | null {
    const row = getActiveVectorRow(db, subjectEntityId, featureKey);
    if (!row) {
        return null;
    }
    return {
        subjectEntityId: row.subject_entity_id,
        analysisGenerationId: row.analysis_generation_id,
        dimensions: row.dimensions,
        normalization: row.normalization,
        metric: row.metric,
        values: decodeFeatureVector(row.vector_blob, row.dimensions),
    };
}

export function* iterateActiveFeatureVectors(db: DbHandle, featureKey: string): Generator<ActiveFeatureVector> {
    const rows = db.prepare(`${activeVectorSql()} ORDER BY vector.subject_entity_id ASC`).iterate(featureKey) as Iterable<ActiveVectorRow>;
    for (const row of rows) {
        yield {
            subjectEntityId: row.subject_entity_id,
            analysisGenerationId: row.analysis_generation_id,
            dimensions: row.dimensions,
            normalization: row.normalization,
            metric: row.metric,
            values: decodeFeatureVector(row.vector_blob, row.dimensions),
        };
    }
}

function distanceToBlob(values: readonly number[], blob: Buffer, metric: FeatureVectorMetric): number {
    if (blob.length !== values.length * Float32Array.BYTES_PER_ELEMENT) {
        throw new Error('Candidate feature vector dimensions do not match its stored BLOB.');
    }
    let dot = 0;
    let leftSquared = 0;
    let rightSquared = 0;
    let squaredDistance = 0;
    for (let index = 0; index < values.length; index += 1) {
        const left = values[index];
        const right = blob.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT);
        if (!Number.isFinite(right)) {
            throw new Error('Candidate feature vector contains a non-finite value.');
        }
        dot += left * right;
        leftSquared += left * left;
        rightSquared += right * right;
        const delta = left - right;
        squaredDistance += delta * delta;
    }
    if (metric === 'euclidean') {
        return Math.sqrt(squaredDistance);
    }
    if (metric === 'dot_product') {
        return -dot;
    }
    const denominator = Math.sqrt(leftSquared * rightSquared);
    return denominator === 0 ? Number.POSITIVE_INFINITY : 1 - (dot / denominator);
}

function addCandidate(best: FeatureVectorCandidate[], candidate: FeatureVectorCandidate, limit: number): void {
    if (!Number.isFinite(candidate.distance)) {
        return;
    }
    const insertionIndex = best.findIndex((current) => candidate.distance < current.distance);
    if (insertionIndex === -1) {
        if (best.length < limit) {
            best.push(candidate);
        }
        return;
    }
    best.splice(insertionIndex, 0, candidate);
    if (best.length > limit) {
        best.pop();
    }
}

export function findActiveFeatureVectorCandidates(
    db: DbHandle,
    input: { subjectEntityId: string; featureKey: string; limit: number },
): FeatureVectorCandidate[] {
    if (!Number.isInteger(input.limit) || input.limit <= 0 || input.limit > 1000) {
        throw new Error('Feature-vector candidate limit must be an integer between 1 and 1000.');
    }
    const sourceRow = getActiveVectorRow(db, input.subjectEntityId, input.featureKey);
    if (!sourceRow) {
        return [];
    }
    const sourceValues = decodeFeatureVector(sourceRow.vector_blob, sourceRow.dimensions);
    const rows = db.prepare(activeVectorSql(`
        AND vector.subject_entity_id <> ?
        AND vector.dimensions = ?
        AND vector.normalization = ?
        AND vector.metric = ?
        AND generation.model_key = ?
        AND generation.model_version = ?
        AND generation.preprocessing_version = ?
        AND generation.config_hash = ?
    `)).iterate(
        input.featureKey,
        input.subjectEntityId,
        sourceRow.dimensions,
        sourceRow.normalization,
        sourceRow.metric,
        sourceRow.model_key,
        sourceRow.model_version,
        sourceRow.preprocessing_version,
        sourceRow.config_hash,
    ) as Iterable<ActiveVectorRow>;

    const best: FeatureVectorCandidate[] = [];
    for (const row of rows) {
        addCandidate(best, {
            subjectEntityId: row.subject_entity_id,
            analysisGenerationId: row.analysis_generation_id,
            distance: distanceToBlob(sourceValues, row.vector_blob, sourceRow.metric),
        }, input.limit);
    }
    return best;
}
