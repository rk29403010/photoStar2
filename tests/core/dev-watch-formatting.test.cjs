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

    assert.match(output, /compiled 2 changed files; running fast lint\./);
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

test('core watch resolves fast lint through node instead of a Windows cmd shim', () => {
    const {
        getFastLintInvocation,
    } = require('../../tooling/scripts/core/dev-watch.cjs');

    const invocation = getFastLintInvocation(['src/services/handlers.ts']);

    assert.equal(invocation.command, process.execPath);
    assert.equal(invocation.args[0], invocation.scriptPath);
    assert.match(invocation.scriptPath, /node_modules[\\/]oxlint[\\/]bin[\\/]oxlint$/);
    assert.deepEqual(invocation.args.slice(1), [
        '-c',
        invocation.configPath,
        'src/services/handlers.ts',
    ]);
});

test('core watch treats fast lint findings as non-fatal for backend restarts', async () => {
    const {
        createFastLintExitHandler,
        LOG_PREFIX,
    } = require('../../tooling/scripts/core/dev-watch.cjs');

    let warning = '';
    let resolved = false;
    let rejected = false;
    const handleExit = createFastLintExitHandler({
        warn: (message) => {
            warning = message;
        },
        onResolve: () => {
            resolved = true;
        },
        onReject: () => {
            rejected = true;
        },
    });

    handleExit(1, null);

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(resolved, true);
    assert.equal(rejected, false);
    assert.match(warning, new RegExp(`${LOG_PREFIX.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')} fast lint reported issues; continuing backend restart\\.`));
});
