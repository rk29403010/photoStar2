import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildGateBlock,
    upsertGate,
} from '../../tooling/scripts/repo/install-git-hooks.mjs';

test('shared pre-commit hook selects a gate available in the committing worktree', () => {
    const hook = buildGateBlock();

    assert.match(hook, /git rev-parse --show-toplevel/u);
    assert.match(hook, /has_package_script "qa:quick"/u);
    assert.match(hook, /has_package_script "quality:staged"/u);
    assert.doesNotMatch(hook, /node tooling\/scripts\/repo\/quality-gate\.js/u);
});

test('hook installer replaces editor-specific and neutral legacy blocks', () => {
    const legacyHook = [
        '#!/bin/sh',
        '# codex-quality-gate:start',
        'echo old',
        '# codex-quality-gate:end',
        '',
    ].join('\n');
    const updated = upsertGate(legacyHook);

    assert.match(updated, /# repo-quality-gate:start/u);
    assert.doesNotMatch(updated, /codex-quality-gate/u);
    assert.equal((updated.match(/repo-quality-gate:start/gu) ?? []).length, 1);
});
