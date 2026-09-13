const { performance } = require('node:perf_hooks');

const SIZES = { development: 10_000, target: 100_000 };
const tier = (process.argv.find((value) => value.startsWith('--tier=')) || '--tier=development').slice(7);
const count = SIZES[tier];
if (!count) { throw new Error('Expected --tier=development or --tier=target.'); }
const samples = Number((process.argv.find((value) => value.startsWith('--samples=')) || '--samples=8').slice(10));
if (!Number.isInteger(samples) || samples < 1) { throw new Error('Expected a positive integer --samples.'); }

async function main() {
    const selection = await import('../../../dist/core/src/shared/utils/librarySelectionState.js');
    const items = Array.from({ length: count }, (_, index) => ({
        selectionKey: `photo:${index}`, entityType: 'photo', photoId: String(index), groupId: null,
        asset: { id: String(index), original_path: `C:/benchmark/${index}.jpg` },
    }));
    let state = selection.updateLibrarySelection(items, selection.createEmptyLibrarySelectionState(), { mode: 'replace', index: 0 });
    globalThis.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const durations = [];
    for (let sample = 0; sample < samples; sample += 1) {
        const started = performance.now();
        state = selection.updateLibrarySelection(items, state, { mode: 'range', index: count - 1 });
        durations.push(performance.now() - started);
    }
    durations.sort((left, right) => left - right);
    const expansionStarted = performance.now();
    const expandedAssetCount = selection.getLibrarySelectionAssetIds(state, []).length;
    const expansionMs = performance.now() - expansionStarted;
    globalThis.gc?.();
    const heapAfter = process.memoryUsage().heapUsed;
    console.log(`LIBRARY_SELECTION_BENCHMARK_RESULT ${JSON.stringify({ tier, itemCount: count, sampleCount: samples, selectedCount: selection.getLibrarySelectionCount(state), expandedAssetCount, expansionMs: Number(expansionMs.toFixed(1)), p50Ms: Number(percentile(durations, 0.5).toFixed(1)), p95Ms: Number(percentile(durations, 0.95).toFixed(1)), maxMs: Number(Math.max(...durations).toFixed(1)), heapDriftMiB: Number(((heapAfter - heapBefore) / (1024 * 1024)).toFixed(1)), targetP95Ms: 150 })}`);
}

function percentile(values, percentileValue) {
    return values[Math.ceil(values.length * percentileValue) - 1];
}
main();

