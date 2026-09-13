const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const VECTOR_COUNT = 250_000;
const GENERATION_COUNT = 100_000;
const DIMENSIONS = 512;
const SAMPLE_COUNT = 20;
const LIMIT = 20;

function vectorBlob() {
    const buffer = Buffer.allocUnsafe(DIMENSIONS * Float32Array.BYTES_PER_ELEMENT);
    for (let index = 0; index < DIMENSIONS; index += 1) {
        buffer.writeFloatLE(index === 0 ? 1 : ((index % 17) - 8) / 1000, index * 4);
    }
    return buffer;
}

function seedTargetTier(db) {
    db.exec('PRAGMA synchronous = OFF; PRAGMA journal_mode = MEMORY;');
    db.prepare(`
        INSERT INTO workflow_runs (id, workflow_id, trigger_type, status, input_subjects_json, parameters_json)
        VALUES ('benchmark-run', 'wp11d-benchmark', 'manual', 'running', '[]', '{}')
    `).run();
    db.prepare(`
        INSERT INTO step_runs (id, workflow_run_id, node_id, status)
        VALUES ('benchmark-step', 'benchmark-run', 'generate-vectors', 'running')
    `).run();
    db.prepare(`
        INSERT INTO subject_executions (
            id, workflow_run_id, step_run_id, subject_type, subject_id, status
        ) VALUES ('benchmark-subject', 'benchmark-run', 'benchmark-step', 'asset', 'benchmark', 'running')
    `).run();

    const insertGeneration = db.prepare(`
        INSERT INTO analysis_generations (
            id, scope_key, workflow_run_id, step_run_id, subject_execution_id,
            input_fingerprint, provider, model_key, model_version, model_artifact_checksum,
            preprocessing_version, config_hash, idempotency_key, status, finished_at
        ) VALUES (?, ?, 'benchmark-run', 'benchmark-step', 'benchmark-subject',
            ?, 'onnxruntime', 'arcface-w600k-r50', '1.0.0', 'sha256:model',
            'arcface-112-v1', 'sha256:config', ?, 'successful', CURRENT_TIMESTAMP)
    `);
    const insertHead = db.prepare(`
        INSERT INTO analysis_generation_heads (scope_key, active_generation_id)
        VALUES (?, ?)
    `);
    const insertEntity = db.prepare(`
        INSERT INTO semantic_entities (id, kind, native_id, label)
        VALUES (?, 'face', ?, NULL)
    `);
    const insertVector = db.prepare(`
        INSERT INTO feature_vectors (
            id, subject_entity_id, analysis_generation_id, feature_key,
            dimensions, normalization, metric, vector_blob
        ) VALUES (?, ?, ?, 'face_embedding', ?, 'none', 'cosine', ?)
    `);
    const blob = vectorBlob();

    db.transaction(() => {
        for (let generationIndex = 0; generationIndex < GENERATION_COUNT; generationIndex += 1) {
            const generationId = `generation:${generationIndex}`;
            const scopeKey = `face-vectors:asset:${generationIndex}`;
            insertGeneration.run(generationId, scopeKey, `input:${generationIndex}`, `key:${generationIndex}`);
            insertHead.run(scopeKey, generationId);
        }
        for (let vectorIndex = 0; vectorIndex < VECTOR_COUNT; vectorIndex += 1) {
            const entityId = `face:${vectorIndex}`;
            const generationIndex = Math.floor((vectorIndex * GENERATION_COUNT) / VECTOR_COUNT);
            insertEntity.run(entityId, entityId);
            insertVector.run(`vector:${vectorIndex}`, entityId, `generation:${generationIndex}`, DIMENSIONS, blob);
        }
    })();
    db.exec('PRAGMA optimize;');
}

function percentile95(values) {
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.ceil(ordered.length * 0.95) - 1];
}

async function main() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp11d-benchmark-'));
    const { DatabaseManager } = require('../../../dist/core/src/data/db.js');
    const retrieval = await import('../../../dist/core/src/services/machineAnalysis/featureVectorRetrieval.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const setupStarted = performance.now();
        seedTargetTier(db);
        const setupMs = performance.now() - setupStarted;

        for (let warmup = 0; warmup < 3; warmup += 1) {
            retrieval.findActiveFeatureVectorCandidates(db, {
                subjectEntityId: 'face:0', featureKey: 'face_embedding', limit: LIMIT,
            });
        }

        const heapBefore = process.memoryUsage().heapUsed;
        let peakHeap = heapBefore;
        const samples = [];
        for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
            const started = performance.now();
            const candidates = retrieval.findActiveFeatureVectorCandidates(db, {
                subjectEntityId: 'face:0', featureKey: 'face_embedding', limit: LIMIT,
            });
            samples.push(performance.now() - started);
            if (candidates.length !== LIMIT) {
                throw new Error(`Expected ${LIMIT} candidates, received ${candidates.length}.`);
            }
            peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
        }

        const p95Ms = percentile95(samples);
        const result = {
            vectorCount: VECTOR_COUNT,
            dimensions: DIMENSIONS,
            rawVectorMiB: (VECTOR_COUNT * DIMENSIONS * 4) / (1024 * 1024),
            setupMs: Number(setupMs.toFixed(1)),
            p95Ms: Number(p95Ms.toFixed(1)),
            minMs: Number(Math.min(...samples).toFixed(1)),
            maxMs: Number(Math.max(...samples).toFixed(1)),
            heapGrowthMiB: Number(((peakHeap - heapBefore) / (1024 * 1024)).toFixed(1)),
            targetP95Ms: 150,
            decision: p95Ms < 150 ? 'native-scan-meets-target' : 'promote-vector-index-proposal',
        };
        console.log(`WP11D_BENCHMARK_RESULT ${JSON.stringify(result)}`);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
