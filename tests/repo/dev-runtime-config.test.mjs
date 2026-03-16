import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { classifyRestartImpact } from '../../tooling/scripts/repo/dev-runtime-config.js';

function createTempGitRepo(packageJson) {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-runtime-config-'));
    execFileSync('git', ['init'], { cwd: tempRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Codex Test'], { cwd: tempRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'codex@example.com'], { cwd: tempRoot, stdio: 'ignore' });
    writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify(packageJson, null, 2));
    execFileSync('git', ['add', 'package.json'], { cwd: tempRoot, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tempRoot, stdio: 'ignore' });
    return tempRoot;
}

function writePackageJson(cwd, packageJson) {
    writeFileSync(path.join(cwd, 'package.json'), JSON.stringify(packageJson, null, 2));
}

test('classifyRestartImpact downgrades script-only package.json changes to manual restart', () => {
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
            lint: 'eslint .',
        },
        dependencies: {
            react: '^19.2.0',
        },
    });

    const impact = classifyRestartImpact(['package.json'], repoRoot);

    assert.equal(impact.level, 'manual-restart');
    assert.match(impact.summary, /Restart the dev runtime/i);
});

test('classifyRestartImpact keeps dependency package.json changes at reinstall', () => {
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

    const impact = classifyRestartImpact(['package.json'], repoRoot);

    assert.equal(impact.level, 'reinstall');
    assert.match(impact.summary, /Reinstall dependencies/i);
});

test('classifyRestartImpact keeps package-lock.json changes at reinstall', () => {
    const impact = classifyRestartImpact(['package-lock.json'], process.cwd());

    assert.equal(impact.level, 'reinstall');
    assert.match(impact.summary, /Reinstall dependencies/i);
});
