import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Codex environment setup and Debug action use repo-owned worktree scripts', () => {
    const environmentSource = readFileSync('.codex/environments/environment.toml', 'utf8');

    assert.match(environmentSource, /\[setup\]\s*[\r\n]+script = "tooling\/scripts\/repo\/codex-worktree-setup\.cmd"/);
    assert.match(environmentSource, /\[\[actions\]\][\s\S]*name = "Debug"[\s\S]*command = "tooling\/scripts\/repo\/codex-worktree-debug\.cmd"/);
});

test('Codex worktree scripts rely on Codex source and worktree environment variables', () => {
    const setupScript = readFileSync('tooling/scripts/repo/codex-worktree-setup.cmd', 'utf8');
    const debugScript = readFileSync('tooling/scripts/repo/codex-worktree-debug.cmd', 'utf8');

    assert.match(setupScript, /CODEX_SOURCE_TREE_PATH/);
    assert.match(setupScript, /CODEX_WORKTREE_PATH/);
    assert.match(setupScript, /mklink \/J/);

    assert.match(debugScript, /CODEX_WORKTREE_PATH/);
    assert.match(debugScript, /CODEX_SOURCE_TREE_PATH/);
    assert.match(debugScript, /npm\.cmd run dev:desktop-runtime/);
});
