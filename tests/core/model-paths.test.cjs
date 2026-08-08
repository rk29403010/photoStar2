const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
    listOnnxModelPathCandidates,
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

test('model paths include the persistent user model directory before a worktree deployment path', () => {
    const candidates = listOnnxModelPathCandidates({
        modelFileName: 'efficient_sam_vitt_encoder.onnx',
        moduleDir: 'C:/worktree/dist/core/src/services/segmentation',
        execPath: 'C:/node/node.exe',
        appDataDir: 'C:/users/test/AppData/Roaming',
    });

    assert.equal(candidates[1], path.join('C:/users/test/AppData/Roaming', 'PhotoLibraryDesktop', 'models', 'efficient_sam_vitt_encoder.onnx'));
});
