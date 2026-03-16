const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function createTempGitRepo(packageJson) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-runtime-impact-'));
    execFileSync('git', ['init'], { cwd: tempRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Codex Test'], { cwd: tempRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'codex@example.com'], { cwd: tempRoot, stdio: 'ignore' });
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify(packageJson, null, 2));
    execFileSync('git', ['add', 'package.json'], { cwd: tempRoot, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tempRoot, stdio: 'ignore' });
    return tempRoot;
}

function writePackageJson(cwd, packageJson) {
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify(packageJson, null, 2));
}

test('getDevRuntimeImpact summarizes changed files and restart severity', async () => {
    const { getDevRuntimeImpact } = await import('../../src/services/handlers/systemDevRuntimeImpact.ts');

    const impact = getDevRuntimeImpact({
        env: {},
        cwd: 'C:/Users/robin/Projects/photoStar2/.worktrees/feature-a',
        getChangedFiles: () => [
            'src/ui/App.tsx',
            'package.json',
        ],
    });

    assert.equal(impact.level, 'reinstall');
    assert.equal(impact.requiresManualRestart, true);
    assert.equal(impact.webPort > 5173, true);
    assert.equal(impact.backendPort - impact.webPort, 1);
    assert.match(impact.summary, /Reinstall dependencies/i);
    assert.deepEqual(impact.files, ['src/ui/App.tsx', 'package.json']);
});

test('getDevRuntimeImpact treats script-only package.json changes as restart app, not reinstall', async () => {
    const repoRoot = createTempGitRepo({
        name: 'photo-star-2',
        scripts: {
            dev: 'vite',
        },
        dependencies: {
            react: '^19.2.0',
        },
    });
    writePackageJson(repoRoot, {
        name: 'photo-star-2',
        scripts: {
            dev: 'vite',
            'dev:kill-ports': 'node tooling/scripts/repo/kill-ports.js',
        },
        dependencies: {
            react: '^19.2.0',
        },
    });

    const { getDevRuntimeImpact } = await import('../../src/services/handlers/systemDevRuntimeImpact.ts');
    const impact = getDevRuntimeImpact({
        env: {},
        cwd: repoRoot,
        getChangedFiles: () => ['package.json'],
    });

    assert.equal(impact.level, 'manual-restart');
    assert.match(impact.summary, /Restart the dev runtime/i);
});

test('getDevRuntimeImpact keeps dependency package.json changes in reinstall state', async () => {
    const repoRoot = createTempGitRepo({
        name: 'photo-star-2',
        dependencies: {
            react: '^19.2.0',
        },
    });
    writePackageJson(repoRoot, {
        name: 'photo-star-2',
        dependencies: {
            react: '^19.2.0',
            '@xyflow/react': '^12.10.1',
        },
    });

    const { getDevRuntimeImpact } = await import('../../src/services/handlers/systemDevRuntimeImpact.ts');
    const impact = getDevRuntimeImpact({
        env: {},
        cwd: repoRoot,
        getChangedFiles: () => ['package.json'],
    });

    assert.equal(impact.level, 'reinstall');
    assert.match(impact.summary, /Reinstall dependencies/i);
});
