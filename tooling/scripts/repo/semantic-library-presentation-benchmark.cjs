const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const TIERS = {
    development: 10_000,
    target: 100_000,
    stretch: 500_000,
};
const PAGE_SIZE = 100;
const DEFAULT_SAMPLE_COUNT = 12;

function sampleCount() {
    const argument = process.argv.find((value) => value.startsWith('--samples='));
    const value = Number(argument?.slice('--samples='.length) || DEFAULT_SAMPLE_COUNT);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error('Expected a positive integer --samples.');
    }
    return value;
}

function pageOffset() {
    const argument = process.argv.find((value) => value.startsWith('--offset='));
    const value = Number(argument?.slice('--offset='.length) || '0');
    if (!Number.isInteger(value) || value < 0) {
        throw new Error('Expected a non-negative integer --offset.');
    }
    return value;
}

function tier() {
    const argument = process.argv.find((value) => value.startsWith('--tier='));
    const name = argument?.slice('--tier='.length) || process.env.PHOTOSTAR_BENCHMARK_TIER || 'target';
    const assetCount = TIERS[name];
    if (!assetCount) {
        throw new Error(`Unknown benchmark tier '${name}'. Expected development, target, or stretch.`);
    }
    return { name, assetCount };
}

function percentile(values, percentileValue) {
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.ceil(ordered.length * percentileValue) - 1];
}

function seedAssets(db, assetCount) {
    const insert = db.prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height, created_at)
        VALUES (?, ?, ?, ?, 4000, 3000, '2026-01-01T00:00:00.000Z')
    `);
    db.transaction(() => {
        for (let index = 0; index < assetCount; index += 1) {
            insert.run(
                `asset:${index}`,
                `C:/benchmark/${index}.jpg`,
                `exact:${Math.floor(index / 4)}`,
                3_000_000 + (index % 100),
            );
        }
    })();
}

async function main() {
    const selectedTier = tier();
    const offset = pageOffset();
    const samples = sampleCount();
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-presentation-benchmark-'));
    const { DatabaseManager } = require('../../../dist/core/src/data/db.js');
    const presentation = await import('../../../dist/core/src/services/relationships/libraryPresentationProjection.js');
    const manager = new DatabaseManager(temporaryDirectory);
    try {
        const db = manager.getDb();
        const setupStarted = performance.now();
        seedAssets(db, selectedTier.assetCount);
        const setupMs = performance.now() - setupStarted;
        const expectedItems = selectedTier.assetCount / 4;
        const cacheRebuildStarted = performance.now();
        if (presentation.countExactCopyPresentationItems(db) !== expectedItems) {
            throw new Error('Benchmark seed did not create the expected exact-copy presentation items.');
        }
        const cacheRebuildMs = performance.now() - cacheRebuildStarted;
        presentation.getExactCopyPresentationPage(db, { limit: PAGE_SIZE, offset });

        global.gc?.();
        const heapBefore = process.memoryUsage().heapUsed;
        const measurements = [];
        for (let sample = 0; sample < samples; sample += 1) {
            const started = performance.now();
            const page = presentation.getExactCopyPresentationPage(db, { limit: PAGE_SIZE, offset });
            measurements.push(performance.now() - started);
            if (page.length !== PAGE_SIZE) {
                throw new Error(`Expected ${PAGE_SIZE} presentation items, received ${page.length}.`);
            }
        }
        global.gc?.();
        const heapAfter = process.memoryUsage().heapUsed;
        const pageCount = db.pragma('page_count', { simple: true });
        const databaseBytes = pageCount * db.pragma('page_size', { simple: true });
        console.log(`SEMANTIC_PRESENTATION_BENCHMARK_RESULT ${JSON.stringify({
            tier: selectedTier.name,
            assetCount: selectedTier.assetCount,
            exactCopyPresentationItems: expectedItems,
            pageOffset: offset,
            sampleCount: samples,
            setupMs: Number(setupMs.toFixed(1)),
            cacheRebuildMs: Number(cacheRebuildMs.toFixed(1)),
            p50Ms: Number(percentile(measurements, 0.5).toFixed(1)),
            p95Ms: Number(percentile(measurements, 0.95).toFixed(1)),
            maxMs: Number(Math.max(...measurements).toFixed(1)),
            heapDriftMiB: Number(((heapAfter - heapBefore) / (1024 * 1024)).toFixed(1)),
            databaseMiB: Number((databaseBytes / (1024 * 1024)).toFixed(1)),
            targetP95Ms: 150,
        })}`);
    } finally {
        manager.close();
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
