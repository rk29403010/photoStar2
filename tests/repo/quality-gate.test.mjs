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

test('quick gate contains changed fast checks and native app/core typechecks', () => {
    const steps = buildQualitySteps('quick');
    assert.deepEqual(steps.map((step) => step.label), [
        'plug-in registry and boundary policy',
        'changed Oxlint',
        'changed complexity',
        'native application typecheck',
        'native core typecheck',
    ]);
    assert.ok(steps.every((step) => !/tsc6(?:\.cmd)?$/u.test(step.command)));
});

test('native and compatibility typecheck commands keep compiler selection in the quality orchestrator', () => {
    const nativeLabels = buildQualitySteps('typecheck:native').map((step) => step.label);
    assert.deepEqual(nativeLabels, [
        'native application typecheck',
        'native tooling typecheck',
        'native core typecheck',
    ]);
    const nativeStep = buildQualitySteps('typecheck:native:app')[0];
    assert.equal(nativeStep.command, process.execPath);
    assert.match(nativeStep.args[0], /node_modules[\\/]@typescript[\\/]native[\\/]bin[\\/]tsc$/u);
    assert.match(buildQualitySteps('typecheck:compat')[0].command, /tsc(?:\.cmd)?$/u);
    assert.doesNotMatch(buildQualitySteps('typecheck:compat')[0].command, /tsc6/u);
});

test('ready gate checks the complete branch with native types and affected test layers', () => {
    const labels = buildQualitySteps('ready').map((step) => step.label);
    assert.deepEqual(labels, [
        'plug-in registry and boundary policy',
        'full Oxlint',
        'changed type-aware ESLint',
        'changed complexity',
        'native application typecheck',
        'native core typecheck',
        'repository tests',
        'UI tests',
        'affected UI boot smoke',
    ]);
});

test('merge gate includes full typed lint, all typechecks, and all test layers', () => {
    const labels = buildQualitySteps('merge').map((step) => step.label);
    assert.ok(labels.includes('full Oxlint'));
    assert.equal(labels.filter((label) => label === 'plug-in registry and boundary policy').length, 1);
    assert.ok(labels.includes('changed application type-aware Oxlint'));
    assert.ok(labels.includes('full type-aware ESLint'));
    assert.ok(labels.includes('native application typecheck'));
    assert.ok(labels.includes('native core build'));
    assert.ok(!labels.includes('native core typecheck'));
    assert.equal(labels.filter((label) => label === 'native core build').length, 1);
    assert.equal(labels.filter((label) => label === 'native core typecheck').length, 0);
    assert.ok(labels.includes('repository tests'));
    assert.ok(labels.includes('UI tests'));
    assert.ok(labels.includes('affected UI boot smoke'));
    assert.ok(labels.includes('core tests'));
});

test('affected UI smoke receives the resolved diff base', () => {
    const smokeStep = buildQualitySteps('ready', 'origin/main').find((step) => step.label === 'affected UI boot smoke');
    assert.deepEqual(smokeStep?.args.slice(-2), ['--base', 'origin/main']);
});

test('unknown quality mode fails clearly', () => {
    assert.throws(() => buildQualitySteps('mystery'), /Expected quick, ready, or merge/);
});
