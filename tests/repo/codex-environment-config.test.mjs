import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Codex environment setup and Debug action use repo-owned worktree scripts', () => {
    const environmentSource = readFileSync('.codex/environments/environment.toml', 'utf8');

    assert.match(environmentSource, /\[setup\]\s*[\r\n]+script = "cmd\.exe \/d \/c tooling\\\\scripts\\\\repo\\\\codex-worktree-setup\.cmd"/);
    assert.match(environmentSource, /\[\[actions\]\][\s\S]*name = "Debug"[\s\S]*command = "cmd\.exe \/d \/c tooling\\\\scripts\\\\repo\\\\codex-worktree-debug\.cmd"/);
    assert.match(environmentSource, /\[\[actions\]\][\s\S]*name = "Stop Debug"[\s\S]*command = "cmd\.exe \/d \/c tooling\\\\scripts\\\\repo\\\\codex-worktree-stop-debug\.cmd"/);
    assert.match(environmentSource, /\[\[actions\]\][\s\S]*name = "Doctor"[\s\S]*command = "cmd\.exe \/d \/c tooling\\\\scripts\\\\repo\\\\codex-worktree-doctor\.cmd"/);
    assert.match(environmentSource, /\[\[actions\]\][\s\S]*name = "Ship"[\s\S]*command = "cmd\.exe \/d \/c tooling\\\\scripts\\\\repo\\\\codex-worktree-ship\.cmd"/);
});

test('Codex action scripts retain the task-worktree handoff when terminal context is missing', () => {
    const setupScript = readFileSync('tooling/scripts/repo/codex-worktree-setup.cmd', 'utf8');
    const debugScript = readFileSync('tooling/scripts/repo/codex-worktree-debug.cmd', 'utf8');
    const stopDebugScript = readFileSync('tooling/scripts/repo/codex-worktree-stop-debug.cmd', 'utf8');
    const doctorScript = readFileSync('tooling/scripts/repo/codex-worktree-doctor.cmd', 'utf8');
    const shipScript = readFileSync('tooling/scripts/repo/codex-worktree-ship.cmd', 'utf8');

    assert.match(setupScript, /CODEX_SOURCE_TREE_PATH/);
    assert.match(setupScript, /CODEX_WORKTREE_PATH/);
    assert.match(setupScript, /mklink \/J/);

    assert.match(debugScript, /codex-worktree-target\.js/);
    assert.doesNotMatch(debugScript, /set "TARGET_PATH=%CD%"/);
    assert.doesNotMatch(debugScript, /Auto-selected most recently modified worktree/);
    assert.match(debugScript, /node\.exe tooling\\scripts\\repo\\thread-dev-session\.js --script dev:desktop-runtime:debug/);
    assert.doesNotMatch(debugScript, /--force-foreground/);
    assert.doesNotMatch(debugScript, /npm\.cmd run thread:start-dev/);
    assert.match(debugScript, /node\.exe tooling\\scripts\\repo\\thread-runtime-url\.js/);
    assert.match(debugScript, /echo Debug URL: %RUNTIME_URL%/);
    assert.match(debugScript, /TARGET_OUTPUT_FILE/);
    assert.match(debugScript, /Failed to resolve a task worktree/);
    assert.match(debugScript, /Target worktree: %TARGET_PATH%/);
    assert.match(debugScript, /did not report a runtime URL/);

    assert.match(stopDebugScript, /CODEX_WORKTREE_PATH/);
    assert.match(stopDebugScript, /if "%TARGET_PATH%"=="" set "TARGET_PATH=%CD%"/);
    assert.doesNotMatch(stopDebugScript, /Missing CODEX_WORKTREE_PATH/);
    assert.match(stopDebugScript, /npx\.cmd pnpm run thread:stop-dev/);

    assert.match(doctorScript, /CODEX_WORKTREE_PATH/);
    assert.match(doctorScript, /if "%TARGET_PATH%"=="" set "TARGET_PATH=%CD%"/);
    assert.doesNotMatch(doctorScript, /Missing CODEX_WORKTREE_PATH/);
    assert.match(doctorScript, /npx\.cmd pnpm run thread:doctor/);

    assert.match(shipScript, /CODEX_WORKTREE_PATH/);
    assert.match(shipScript, /set "TARGET_PATH=%CODEX_WORKTREE_PATH%"/);
    assert.match(shipScript, /if "%TARGET_PATH%"=="" set "TARGET_PATH=%CD%"/);
    assert.doesNotMatch(shipScript, /Ship must be run from a dedicated worktree branch, not from main/);
    assert.match(shipScript, /node\.exe tooling\\scripts\\repo\\thread-ship\.js/);
});

test('Codex setup records the selected task worktree for later actions', () => {
    const setupScript = readFileSync('tooling/scripts/repo/codex-worktree-setup.cmd', 'utf8');

    assert.match(setupScript, /codex-worktree-target\.js --record/);
});
