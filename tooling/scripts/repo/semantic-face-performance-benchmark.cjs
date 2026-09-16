const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const TIERS = {
    development: { faceCount: 20_000, personCount: 1_000 },
    target: { faceCount: 250_000, personCount: 1_000 },
};
const CANDIDATES_PER_FACE = 5;
const SAMPLE_COUNT = 8;

function benchmarkTier() {
    const name = (process.argv.find((value) => value.startsWith('--tier=')) ?? '--tier=development').slice(7);
    const tier = TIERS[name];
    if (!tier) {
        throw new Error('Expected --tier=development or --tier=target.');
    }
    return { name, ...tier };
}

function percentile95(values) {
    return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];
}

function seedCandidateFixture(db, tier) {
    db.pragma('foreign_keys = OFF');
    db.pragma('journal_mode = MEMORY');
    db.pragma('synchronous = OFF');
    const insertPerson = db.prepare('INSERT INTO people (id, name) VALUES (?, ?)');
    const insertIdentity = db.prepare('INSERT INTO asset_identities (guid, original_path) VALUES (?, ?)');
    const insertAsset = db.prepare('INSERT INTO assets (id, original_path, asset_identity_guid) VALUES (?, ?, ?)');
    const insertRegion = db.prepare('INSERT INTO visual_regions (id, asset_identity_guid) VALUES (?, ?)');
    const insertFace = db.prepare('INSERT INTO faces (id, visual_region_id) VALUES (?, ?)');
    const insertCandidate = db.prepare(`
        INSERT INTO face_person_candidates (
            face_id, person_id, source_analysis_generation_id,
            anchor_face_id, anchor_analysis_generation_id,
            raw_cosine, rank, runner_up_score, winner_margin,
            model_key, model_version, preprocessing_version, config_hash,
            decision_status, review_eligible, auto_action_eligible
        ) VALUES (?, ?, 'generation:benchmark', ?, 'generation:benchmark',
                  ?, ?, 0.8, 0.1, 'arcface', '1', '1', 'benchmark', NULL, 1, 0)
    `);
    db.transaction(() => {
        for (let personIndex = 0; personIndex < tier.personCount; personIndex += 1) {
            insertPerson.run(`person:${personIndex}`, `Person ${personIndex}`);
        }
        for (let faceIndex = 0; faceIndex < tier.faceCount; faceIndex += 1) {
            const assetId = `asset:${faceIndex}`;
            const identityId = `identity:${faceIndex}`;
            const regionId = `region:${faceIndex}`;
            const faceId = `face:${faceIndex}`;
            const originalPath = `C:/benchmark/${faceIndex}.jpg`;
            insertIdentity.run(identityId, originalPath);
            insertAsset.run(assetId, originalPath, identityId);
            insertRegion.run(regionId, identityId);
            insertFace.run(faceId, regionId);
            for (let rank = 1; rank <= CANDIDATES_PER_FACE; rank += 1) {
                const personId = `person:${(faceIndex + rank - 1) % tier.personCount}`;
                insertCandidate.run(faceId, personId, faceId, 0.95 - rank * 0.03, rank);
            }
        }
    })();
    db.pragma('foreign_keys = ON');
    db.exec('PRAGMA optimize;');
}

function measureCandidateLookup(dbManager, handlers) {
    const durations = [];
    let assignmentCount = 0;
    for (let sample = 0; sample < SAMPLE_COUNT + 2; sample += 1) {
        let response;
        const started = performance.now();
        handlers.get_person_face_candidates({
            id: `benchmark:${sample}`,
            payload: { personId: 'person:0' },
            originWs: null,
            dbManager,
            respond: (_id, status, data, error) => { response = { status, data, error }; },
        });
        const elapsed = performance.now() - started;
        if (response?.status !== 'ok') {
            throw new Error(response?.error ?? 'Candidate lookup did not respond.');
        }
        assignmentCount = response.data.assignments.length;
        if (sample >= 2) {
            durations.push(elapsed);
        }
    }
    return {
        assignmentCount,
        p50Ms: Number([...durations].sort((left, right) => left - right)[3].toFixed(1)),
        p95Ms: Number(percentile95(durations).toFixed(1)),
    };
}

function buildClusters(prefix, faceCount) {
    const clusters = [];
    for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 4) {
        clusters.push({
            id: `${prefix}:${faceIndex / 4}`,
            faceIds: Array.from({ length: Math.min(4, faceCount - faceIndex) },
                (_, offset) => `face:${faceIndex + offset}`),
        });
    }
    return clusters;
}

function measureClusterReconciliation(reconcileIdentityClusterIds, tier) {
    const previous = buildClusters('previous', tier.faceCount);
    const proposed = buildClusters('proposed', tier.faceCount);
    const heapBefore = process.memoryUsage().heapUsed;
    const started = performance.now();
    const reconciled = reconcileIdentityClusterIds(previous, proposed);
    const elapsedMs = performance.now() - started;
    if (reconciled.length !== proposed.length || reconciled[0]?.id !== previous[0]?.id) {
        throw new Error('Cluster reconciliation benchmark produced an invalid result.');
    }
    return {
        clusterCount: proposed.length,
        elapsedMs: Number(elapsedMs.toFixed(1)),
        heapGrowthMiB: Number(((process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024)).toFixed(1)),
    };
}

async function main() {
    const tier = benchmarkTier();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-face-performance-'));
    const { DatabaseManager } = require('../../../dist/core/src/data/db.js');
    const { peopleCandidateCommandHandlers } = await import('../../../dist/core/src/services/handlers/peopleCandidateCommands.js');
    const { reconcileIdentityClusterIds } = await import('../../../dist/core/src/services/faces/identityClusterReconciliation.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const setupStarted = performance.now();
        seedCandidateFixture(dbManager.getDb(), tier);
        const setupMs = performance.now() - setupStarted;
        const candidateLookup = measureCandidateLookup(dbManager, peopleCandidateCommandHandlers);
        const clusterReconciliation = measureClusterReconciliation(reconcileIdentityClusterIds, tier);
        const databaseBytes = fs.readdirSync(tempDir)
            .map((entry) => fs.statSync(path.join(tempDir, entry)).size)
            .reduce((total, size) => total + size, 0);
        console.log(`SEMANTIC_FACE_BENCHMARK_RESULT ${JSON.stringify({
            tier: tier.name,
            faceCount: tier.faceCount,
            candidateCount: tier.faceCount * CANDIDATES_PER_FACE,
            setupMs: Number(setupMs.toFixed(1)),
            databaseMiB: Number((databaseBytes / (1024 * 1024)).toFixed(1)),
            candidateLookup,
            clusterReconciliation,
            targetP95Ms: 150,
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
