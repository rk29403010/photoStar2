import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildQualitySteps,
    resolveQualityBase,
} from '../../tooling/scripts/repo/quality-gate.js';

function taskBranchGitFixture(args) {
    return args.includes('--show-current') ? 'task/example' : 'verified';
}

test('quality base prefers explicit and CI event bases', () => {
    assert.equal(resolveQualityBase({ explicitBase: 'abc123', env: {}, git: () => '' }), 'abc123');
    assert.equal(resolveQualityBase({ env: { QA_BASE_SHA: 'before-sha' }, git: () => '' }), 'before-sha');
    assert.equal(resolveQualityBase({ env: { GITHUB_BASE_REF: 'develop' }, git: () => '' }), 'origin/develop');
});

test('quality base compares task branches with origin main', () => {
    assert.equal(resolveQualityBase({ env: {}, git: taskBranchGitFixture }), 'origin/main');
});

test('quick gate contains only changed fast checks', () => {
    assert.deepEqual(buildQualitySteps('quick').map((step) => step.label), [
        'changed Oxlint',
        'changed complexity',
    ]);
});

test('merge gate includes full typed lint, all typechecks, and all test layers', () => {
    const labels = buildQualitySteps('merge').map((step) => step.label);
    assert.ok(labels.includes('full Oxlint'));
    assert.ok(labels.includes('changed application type-aware Oxlint'));
    assert.ok(labels.includes('full type-aware ESLint'));
    assert.ok(labels.includes('application typecheck'));
    assert.ok(labels.includes('core typecheck'));
    assert.ok(labels.includes('repository tests'));
    assert.ok(labels.includes('UI tests'));
    assert.ok(labels.includes('core tests'));
});

test('unknown quality mode fails clearly', () => {
    assert.throws(() => buildQualitySteps('mystery'), /Expected quick, ready, or merge/);
});
