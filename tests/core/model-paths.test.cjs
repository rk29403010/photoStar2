const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
    resolveOnnxModelPath,
} = require('../../dist/core/src/services/modelPaths.js');

test('resolveOnnxModelPath prefers the restructured deployments/common/models directory', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const compiledJobsDir = path.join(repoRoot, 'dist', 'core', 'src', 'services', 'jobs');
    const fakeExecPath = path.join(repoRoot, 'deployments', 'desktop', 'tauri', 'binaries', 'core.exe');

    const resolvedPath = resolveOnnxModelPath({
        modelFileName: 'det_10g.onnx',
        moduleDir: compiledJobsDir,
        execPath: fakeExecPath,
    });

    assert.equal(
        resolvedPath,
        path.join(repoRoot, 'deployments', 'common', 'models', 'det_10g.onnx')
    );
});
