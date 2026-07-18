import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    isTypeAwareApplicationFile,
    qualityPolicy,
    resolveComplexityThresholds,
} from '../../tooling/scripts/repo/quality-policy.js';
import {
    parseGitPathList,
    selectQualityFiles,
} from '../../tooling/scripts/repo/quality-file-selection.js';

const requiredIsolationIgnores = [
    '.agents/**',
    '.worktrees/**',
    'worktrees/**',
    'scratch/**',
    'artifacts/**',
];

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

function runUnusualPathGitFixture(args) {
    if (args[0] === 'diff') {
        return 'staged.ts\0folder/name with spaces.ts\0';
    }
    return 'line\nbreak.ts\0';
}

test('quality policy defines the canonical complexity and reviewability limits', () => {
    assert.deepEqual(qualityPolicy.complexity, {
        maxCyclomatic: 10,
        maxCognitive: 20,
        maxFunctionLines: 90,
    });
    assert.deepEqual(qualityPolicy.reviewability, {
        advisoryFileLines: 800,
        applicationFileLines: 1200,
    });
});

test('type-aware Oxlint scope covers maintained application TypeScript only', () => {
    assert.equal(isTypeAwareApplicationFile('src/ui/App.tsx'), true);
    assert.equal(isTypeAwareApplicationFile('src\\shared\\types.ts'), true);
    assert.equal(isTypeAwareApplicationFile('src/boundary/transport/usePhotoLibrary.transport.ts'), true);
    assert.equal(isTypeAwareApplicationFile('src/services/backend.ts'), false);
    assert.equal(isTypeAwareApplicationFile('tests/ui/example.ts'), false);
    assert.equal(isTypeAwareApplicationFile('src/ui/styles.css'), false);
});

test('complexity environment overrides are validated and retain canonical defaults', () => {
    assert.deepEqual(resolveComplexityThresholds({}), {
        maxCyclomatic: 10,
        maxCognitive: 20,
        maxLoc: 90,
    });
    assert.deepEqual(resolveComplexityThresholds({
        COMPLEXITY_MAX_CYCLOMATIC: '8',
        COMPLEXITY_MAX_COGNITIVE: '16',
        COMPLEXITY_MAX_LOC: '70',
    }), {
        maxCyclomatic: 8,
        maxCognitive: 16,
        maxLoc: 70,
    });
    assert.throws(
        () => resolveComplexityThresholds({ COMPLEXITY_MAX_CYCLOMATIC: 'invalid' }),
        /positive integers/,
    );
});

test('all lint configurations use the canonical ignore policy', async () => {
    const [eslintSource, oxlintConfig, fastOxlintConfig] = await Promise.all([
        readFile('eslint.config.js', 'utf8'),
        readJson('.oxlintrc.json'),
        readJson('.oxlintrc.fast-loop.json'),
    ]);

    assert.match(eslintSource, /globalIgnores\(qualityPolicy\.lintIgnores\)/u);
    assert.deepEqual(oxlintConfig.ignorePatterns, [...qualityPolicy.lintIgnores]);
    assert.deepEqual(fastOxlintConfig.ignorePatterns, [...qualityPolicy.lintIgnores]);
    for (const pattern of requiredIsolationIgnores) {
        assert.ok(qualityPolicy.lintIgnores.includes(pattern), `missing isolation ignore: ${pattern}`);
    }
});

test('markdownlint ignores every generated and isolated quality-policy path', async () => {
    const markdownIgnores = (await readFile('.markdownlintignore', 'utf8'))
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);

    assert.deepEqual(markdownIgnores, [...qualityPolicy.lintIgnores]);
});

test('Oxlint reviewability limits match the canonical policy', async () => {
    const config = await readJson('.oxlintrc.json');
    const applicationOverride = config.overrides.find((override) => {
        return override.files.includes('src/**/*.{ts,tsx,js,jsx}');
    });

    assert.equal(config.rules['max-lines-per-function'][1].max, qualityPolicy.complexity.maxFunctionLines);
    assert.equal(config.rules['max-lines'][1].max, qualityPolicy.reviewability.advisoryFileLines);
    assert.equal(
        applicationOverride.rules['max-lines'][1].max,
        qualityPolicy.reviewability.applicationFileLines,
    );
});

test('comprehensive Oxlint enables multi-file cycle analysis without slowing the fast loop', async () => {
    const [config, fastConfig] = await Promise.all([
        readJson('.oxlintrc.json'),
        readJson('.oxlintrc.fast-loop.json'),
    ]);

    assert.ok(config.plugins.includes('import'));
    assert.equal(config.rules['import/no-cycle'], 'error');
    assert.ok(!fastConfig.plugins.includes('import'));
});

test('changed quality selection combines committed, working, staged, and untracked paths', () => {
    const invocations = [];
    const outputs = new Map([
        ['diff --name-only --diff-filter=ACMRT -z base-sha...HEAD', 'committed.ts\0shared.ts\0'],
        ['diff --name-only --diff-filter=ACMRT -z HEAD', 'working.ts\0shared.ts\0'],
        ['ls-files --others --exclude-standard -z', 'untracked.ts\0'],
    ]);
    const runGit = (args) => {
        const key = args.join(' ');
        invocations.push(key);
        return outputs.get(key) ?? '';
    };

    assert.deepEqual(selectQualityFiles({ mode: 'changed', diffBase: 'base-sha', runGit }), [
        'committed.ts',
        'shared.ts',
        'working.ts',
        'untracked.ts',
    ]);
    assert.deepEqual(invocations, [
        'diff --name-only --diff-filter=ACMRT -z base-sha...HEAD',
        'diff --name-only --diff-filter=ACMRT -z HEAD',
        'ls-files --others --exclude-standard -z',
    ]);
});

test('changed quality selection includes local edits and preserves unusual path characters', () => {
    assert.deepEqual(selectQualityFiles({ mode: 'changed', runGit: runUnusualPathGitFixture }), [
        'staged.ts',
        'folder/name with spaces.ts',
        'line\nbreak.ts',
    ]);
    assert.deepEqual(parseGitPathList('first.ts\0second.ts\0'), ['first.ts', 'second.ts']);
});
