const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const TIERS = {
    development: { faceCount: 20_000, scopeCount: 1_000 },
    target: { faceCount: 250_000, scopeCount: 1_000 },
};
const DIMENSIONS = 512;
const GENERATIONS_PER_SCOPE = 3;

function benchmarkTier() {
    const name = (process.argv.find((value) => value.startsWith('--tier=')) ?? '--tier=development').slice(7);
    const tier = TIERS[name];
    if (!tier) {
        throw new Error('Expected --tier=development or --tier=target.');
    }
    return { name, ...tier };
}

function directoryBytes(directory) {
    return fs.readdirSync(directory)
        .map((entry) => fs.statSync(path.join(directory, entry)).size)
        .reduce((total, size) => total + size, 0);
}

function insertGenerationRow(insert, scopeIndex, generationIndex) {
    const id = `generation:${scopeIndex}:${generationIndex}`;
    const previousId = generationIndex === 0 ? null : `generation:${scopeIndex}:${generationIndex - 1}`;
    const status = generationIndex === GENERATIONS_PER_SCOPE - 1 ? 'successful' : 'superseded';
    insert.run(
        id, `face-vectors:${scopeIndex}`, `run:${scopeIndex}`, `step:${scopeIndex}`,
        `subject:${scopeIndex}`, `input:${scopeIndex}:${generationIndex}`,
        `idempotency:${scopeIndex}:${generationIndex}`, previousId, status,
    );
}

function seedGenerationFixture(db, tier) {
    db.pragma('foreign_keys = OFF');
    db.pragma('journal_mode = MEMORY');
    db.pragma('synchronous = OFF');
    const insertGeneration = db.prepare(`
        INSERT INTO analysis_generations (
            id, scope_key, workflow_run_id, step_run_id, subject_execution_id,
            input_fingerprint, provider, model_key, model_version,
            preprocessing_version, config_hash, idempotency_key,
            supersedes_generation_id, status, created_at, updated_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'benchmark', 'arcface', '1', '1',
                  'benchmark', ?, ?, ?, '2020-01-01', '2020-01-01', '2020-01-01')
    `);
    const insertHead = db.prepare(`
        INSERT INTO analysis_generation_heads (scope_key, active_generation_id)
        VALUES (?, ?)
    `);
    const insertVector = db.prepare(`
        INSERT INTO feature_vectors (
            id, subject_entity_id, analysis_generation_id, feature_key,
            dimensions, normalization, metric, vector_blob
        ) VALUES (?, ?, ?, 'face_embedding', ?, 'l2', 'cosine', ?)
    `);
    const vectorBlob = Buffer.alloc(DIMENSIONS * Float32Array.BYTES_PER_ELEMENT);
    vectorBlob.writeFloatLE(1, 0);
    db.transaction(() => {
        for (let scopeIndex = 0; scopeIndex < tier.scopeCount; scopeIndex += 1) {
            for (let generationIndex = 0; generationIndex < GENERATIONS_PER_SCOPE; generationIndex += 1) {
                insertGenerationRow(insertGeneration, scopeIndex, generationIndex);
            }
            insertHead.run(
                `face-vectors:${scopeIndex}`,
                `generation:${scopeIndex}:${GENERATIONS_PER_SCOPE - 1}`,
            );
        }
        for (let faceIndex = 0; faceIndex < tier.faceCount; faceIndex += 1) {
            const scopeIndex = faceIndex % tier.scopeCount;
            for (let generationIndex = 0; generationIndex < GENERATIONS_PER_SCOPE; generationIndex += 1) {
                insertVector.run(
                    `vector:${faceIndex}:${generationIndex}`,
                    `face:${faceIndex}`,
                    `generation:${scopeIndex}:${generationIndex}`,
                    DIMENSIONS,
                    vectorBlob,
                );
            }
        }
    })();
    db.pragma('foreign_keys = ON');
}

async function main() {
    const tier = benchmarkTier();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-generation-compaction-'));
    const { DatabaseManager } = require('../../../dist/core/src/data/db.js');
    const maintenance = await import('../../../dist/core/src/services/machineAnalysis/analysisGenerationMaintenance.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const setupStarted = performance.now();
        seedGenerationFixture(db, tier);
        const setupMs = performance.now() - setupStarted;
        const beforeBytes = directoryBytes(tempDir);
        const heapBefore = process.memoryUsage().heapUsed;
        const compactionStarted = performance.now();
        const result = maintenance.compactAnalysisGenerationVectors(db, {
            completedBefore: '2030-01-01T00:00:00.000Z',
        });
        const compactionMs = performance.now() - compactionStarted;
        const afterDeleteBytes = directoryBytes(tempDir);
        const retainedVectorCount = db.prepare('SELECT COUNT(*) AS count FROM feature_vectors').get().count;
        const vacuumStarted = performance.now();
        db.exec('VACUUM');
        const vacuumMs = performance.now() - vacuumStarted;
        const afterVacuumBytes = directoryBytes(tempDir);
        const expectedDeleted = tier.faceCount;
        const expectedRetained = tier.faceCount * 2;
        if (result.deletedVectorCount !== expectedDeleted || retainedVectorCount !== expectedRetained) {
            throw new Error(`Expected ${expectedDeleted} deleted and ${expectedRetained} retained vectors.`);
        }
        console.log(`SEMANTIC_GENERATION_COMPACTION_RESULT ${JSON.stringify({
            tier: tier.name,
            faceCount: tier.faceCount,
            vectorCountBefore: tier.faceCount * GENERATIONS_PER_SCOPE,
            deletedVectorCount: result.deletedVectorCount,
            retainedVectorCount,
            compactedGenerationCount: result.compactedGenerationIds.length,
            setupMs: Number(setupMs.toFixed(1)),
            compactionMs: Number(compactionMs.toFixed(1)),
            vacuumMs: Number(vacuumMs.toFixed(1)),
            databaseMiBBefore: Number((beforeBytes / (1024 * 1024)).toFixed(1)),
            databaseMiBAfterDelete: Number((afterDeleteBytes / (1024 * 1024)).toFixed(1)),
            databaseMiBAfterVacuum: Number((afterVacuumBytes / (1024 * 1024)).toFixed(1)),
            heapGrowthMiB: Number(((process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024)).toFixed(1)),
        })}`);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
