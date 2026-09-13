const { performance } = require('node:perf_hooks');

const SIZES = { development: 10_000, target: 100_000 };
const tier = (process.argv.find((value) => value.startsWith('--tier=')) || '--tier=development').slice(7);
const count = SIZES[tier];
if (!count) { throw new Error('Expected --tier=development or --tier=target.'); }

async function main() {
    const selection = await import('../../../dist/core/src/shared/utils/librarySelectionState.js');
    const items = Array.from({ length: count }, (_, index) => ({
        selectionKey: `photo:${index}`, entityType: 'photo', photoId: String(index), groupId: null,
        asset: { id: String(index), original_path: `C:/benchmark/${index}.jpg` },
    }));
    let state = selection.updateLibrarySelection(items, selection.createEmptyLibrarySelectionState(), { mode: 'replace', index: 0 });
    const durations = [];
    for (let sample = 0; sample < 8; sample += 1) {
        const started = performance.now();
        state = selection.updateLibrarySelection(items, state, { mode: 'range', index: count - 1 });
        durations.push(performance.now() - started);
    }
    durations.sort((left, right) => left - right);
    const expansionStarted = performance.now();
    const expandedAssetCount = selection.getLibrarySelectionAssetIds(state, []).length;
    const expansionMs = performance.now() - expansionStarted;
    console.log(`LIBRARY_SELECTION_BENCHMARK_RESULT ${JSON.stringify({ tier, itemCount: count, selectedCount: selection.getLibrarySelectionCount(state), expandedAssetCount, expansionMs: Number(expansionMs.toFixed(1)), p50Ms: Number(durations[3].toFixed(1)), p95Ms: Number(durations[7].toFixed(1)), targetP95Ms: 150 })}`);
}
main();

