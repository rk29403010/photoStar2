const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('core watch summarizes clean rebuilds instead of echoing every changed file', () => {
    const {
        createChangeBatchTracker,
        createCompilerOutputHandler,
    } = require('../../tooling/scripts/core/dev-watch.cjs');

    const tracker = createChangeBatchTracker();
    const repoRoot = path.resolve(__dirname, '..', '..');
    tracker.recordFileChange(path.join(repoRoot, 'src', 'services', 'handlers.ts'));
    tracker.recordFileChange(path.join(repoRoot, 'src', 'data', 'db.ts'));

    let output = '';
    let restartCount = 0;
    const handleCompilerOutput = createCompilerOutputHandler({
        changeBatchTracker: tracker,
        restartRuntimeProcess: () => {
            restartCount += 1;
        },
        write: (text) => {
            output += text;
        },
    });

    handleCompilerOutput(Buffer.from('Found 0 errors. Watching for file changes.\n'));

    assert.match(output, /compiled 2 changed files\./);
    assert.doesNotMatch(output, /Found 0 errors/);
    assert.equal(restartCount, 1);
});

test('core watch preserves the default clean-build line for the initial compile', () => {
    const {
        createChangeBatchTracker,
        createCompilerOutputHandler,
    } = require('../../tooling/scripts/core/dev-watch.cjs');

    let output = '';
    const handleCompilerOutput = createCompilerOutputHandler({
        changeBatchTracker: createChangeBatchTracker(),
        restartRuntimeProcess: () => {},
        write: (text) => {
            output += text;
        },
    });

    handleCompilerOutput(Buffer.from('Found 0 errors. Watching for file changes.\n'));

    assert.match(output, /Found 0 errors\. Watching for file changes\./);
});
