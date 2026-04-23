import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Codex environment setup and Debug action use repo-owned worktree scripts', () => {
    const environmentSource = readFileSync('.codex/environments/environment.toml', 'utf8');

    assert.match(environmentSource, /\[setup\]\s*[\r\n]+script = "cmd\.exe \/d \/c tooling\\\\scripts\\\\repo\\\\codex-worktree-setup\.cmd"/);
    assert.match(environmentSource, /\[\[actions\]\][\s\S]*name = "Debug"[\s\S]*command = "cmd\.exe \/d \/c tooling\\\\scripts\\\\repo\\\\codex-worktree-debug\.cmd"/);
    assert.match(environmentSource, /\[\[actions\]\][\s\S]*name = "Stop Debug"[\s\S]*command = "cmd\.exe \/d \/c tooling\\\\scripts\\\\repo\\\\codex-worktree-stop-debug\.cmd"/);
    assert.match(environmentSource, /\[\[actions\]\][\s\S]*name = "Doctor"[\s\S]*command = "cmd\.exe \/d \/c tooling\\\\scripts\\\\repo\\\\codex-worktree-doctor\.cmd"/);
});

test('Codex worktree scripts fail fast when the worktree context is missing', () => {
    const setupScript = readFileSync('tooling/scripts/repo/codex-worktree-setup.cmd', 'utf8');
    const debugScript = readFileSync('tooling/scripts/repo/codex-worktree-debug.cmd', 'utf8');
    const stopDebugScript = readFileSync('tooling/scripts/repo/codex-worktree-stop-debug.cmd', 'utf8');
    const doctorScript = readFileSync('tooling/scripts/repo/codex-worktree-doctor.cmd', 'utf8');

    assert.match(setupScript, /CODEX_SOURCE_TREE_PATH/);
    assert.match(setupScript, /CODEX_WORKTREE_PATH/);
    assert.match(setupScript, /mklink \/J/);

    assert.match(debugScript, /CODEX_WORKTREE_PATH/);
    assert.match(debugScript, /if "%CODEX_WORKTREE_PATH%"==""/);
    assert.match(debugScript, /Missing CODEX_WORKTREE_PATH/);
    assert.match(debugScript, /npm\.cmd run thread:start-dev -- --script dev:desktop-runtime/);
    assert.match(debugScript, /node\.exe tooling\\scripts\\repo\\thread-runtime-url\.js/);
    assert.match(debugScript, /echo Debug URL: %RUNTIME_URL%/);

    assert.match(stopDebugScript, /CODEX_WORKTREE_PATH/);
    assert.match(stopDebugScript, /if "%CODEX_WORKTREE_PATH%"==""/);
    assert.match(stopDebugScript, /Missing CODEX_WORKTREE_PATH/);
    assert.match(stopDebugScript, /npm\.cmd run thread:stop-dev/);

    assert.match(doctorScript, /CODEX_WORKTREE_PATH/);
    assert.match(doctorScript, /if "%CODEX_WORKTREE_PATH%"==""/);
    assert.match(doctorScript, /Missing CODEX_WORKTREE_PATH/);
    assert.match(doctorScript, /npm\.cmd run thread:doctor/);
});
