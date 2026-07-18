#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runCommandSync } from './process-invocation.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..', '..', '..');
const nodeExecutable = process.execPath;
const gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';

function packageBinary(name, platform = process.platform) {
    return path.join(workspaceRoot, 'node_modules', '.bin', platform === 'win32' ? `${name}.cmd` : name);
}

function parseArgs(argv) {
    const mode = argv.find((token) => !token.startsWith('--')) ?? 'quick';
    const baseIndex = argv.indexOf('--base');
    const inlineBase = argv.find((token) => token.startsWith('--base='));
    const base = inlineBase?.slice('--base='.length)
        ?? (baseIndex >= 0 ? argv[baseIndex + 1] : '');
    return { mode, base: base?.trim() ?? '' };
}

function runGitText(args, cwd = workspaceRoot) {
    const result = runCommandSync({
        command: gitExecutable,
        args,
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return (result.status ?? 1) === 0 ? result.stdout.trim() : '';
}

export function resolveQualityBase({ explicitBase = '', env = process.env, git = runGitText } = {}) {
    if (explicitBase) {
        return explicitBase;
    }
    if (env.QA_BASE_SHA) {
        return env.QA_BASE_SHA;
    }
    if (env.GITHUB_BASE_REF) {
        return `origin/${env.GITHUB_BASE_REF}`;
    }

    const branch = git(['branch', '--show-current']);
    if (branch && branch !== 'main' && branch !== 'master' && git(['rev-parse', '--verify', '--quiet', 'origin/main'])) {
        return 'origin/main';
    }
    if ((branch === 'main' || branch === 'master') && git(['rev-parse', '--verify', '--quiet', 'HEAD^'])) {
        return 'HEAD^';
    }
    return '';
}

const markdownArgs = [
    '**/*.md',
    '--ignore', 'node_modules',
    '--ignore', 'deployments/desktop/tauri/target',
    '--ignore', 'artifacts',
    '--ignore', 'scratch',
    '--ignore', '.agents',
    '--ignore', '.worktrees',
    '--ignore', 'worktrees',
];

function changedStep(label, scriptName, extraArgs = []) {
    return {
        label,
        command: nodeExecutable,
        args: [path.join(scriptDirectory, scriptName), '--changed', ...extraArgs],
    };
}

export function buildQualitySteps(mode) {
    const quick = [
        changedStep('changed Oxlint', 'lint-changed-files.mjs', ['--tool=oxlint']),
        changedStep('changed complexity', 'complexity-changed-files.mjs'),
    ];
    if (mode === 'quick') {
        return quick;
    }

    const ready = [
        { label: 'full Oxlint', command: packageBinary('oxlint'), args: ['-c', '.oxlintrc.json', '.'] },
        changedStep('changed type-aware ESLint', 'lint-changed-files.mjs'),
        changedStep('changed complexity', 'complexity-changed-files.mjs'),
        { label: 'application typecheck', command: packageBinary('tsc'), args: ['-b', '--pretty', 'false'] },
        { label: 'core typecheck', command: packageBinary('tsc'), args: ['-p', 'tooling/config/tsconfig.core.json', '--noEmit', '--pretty', 'false'] },
        { label: 'repository tests', command: nodeExecutable, args: ['--test', 'tests/repo/*.test.mjs'] },
        { label: 'UI tests', command: nodeExecutable, args: ['--test', 'tests/ui/*.test.cjs'] },
    ];
    if (mode === 'ready') {
        return ready;
    }
    if (mode !== 'merge') {
        throw new Error(`Unknown QA mode "${mode}". Expected quick, ready, or merge.`);
    }

    return [
        { label: 'full Oxlint', command: packageBinary('oxlint'), args: ['-c', '.oxlintrc.json', '.'] },
        changedStep('changed application type-aware Oxlint', 'lint-changed-files.mjs', [
            '--tool=oxlint',
            '--type-aware',
            '--application-only',
        ]),
        {
            label: 'full type-aware ESLint',
            command: packageBinary('eslint'),
            args: ['.', '--cache', '--cache-strategy', 'content', '--cache-location', 'node_modules/.cache/eslint'],
        },
        changedStep('branch complexity', 'complexity-changed-files.mjs'),
        { label: 'Markdown lint', command: packageBinary('markdownlint'), args: markdownArgs },
        { label: 'application typecheck', command: packageBinary('tsc'), args: ['-b', '--pretty', 'false'] },
        { label: 'core typecheck', command: packageBinary('tsc'), args: ['-p', 'tooling/config/tsconfig.core.json', '--noEmit', '--pretty', 'false'] },
        { label: 'repository tests', command: nodeExecutable, args: ['--test', 'tests/repo/*.test.mjs'] },
        { label: 'UI tests', command: nodeExecutable, args: ['--test', 'tests/ui/*.test.cjs'] },
        {
            label: 'core build',
            command: packageBinary('tsc'),
            args: ['-p', 'tooling/config/tsconfig.core.json', '--pretty', 'false'],
        },
        {
            label: 'core post-compile',
            command: nodeExecutable,
            args: ['tooling/scripts/core/post-compile.cjs'],
        },
        { label: 'core tests', command: nodeExecutable, args: ['--test', 'tests/core/*.test.cjs'] },
    ];
}

function runStep(step, env) {
    const startedAt = Date.now();
    console.log(`[qa] Starting ${step.label}`);
    const result = runCommandSync({
        command: step.command,
        args: step.args,
        cwd: workspaceRoot,
        env,
        stdio: 'inherit',
    });
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (result.error || (result.status ?? 1) !== 0) {
        const detail = result.error?.message ?? `exit ${result.status ?? 'unknown'}`;
        throw new Error(`${step.label} failed after ${seconds}s (${detail}).`);
    }
    console.log(`[qa] Passed ${step.label} in ${seconds}s`);
}

export function runQualityGate({ mode, base, env = process.env }) {
    const resolvedBase = mode === 'quick'
        ? ''
        : resolveQualityBase({ explicitBase: base, env });
    const gateEnv = resolvedBase ? { ...env, LINT_DIFF_BASE: resolvedBase } : env;
    console.log(`[qa] Mode: ${mode}; base: ${resolvedBase || 'working tree'}`);
    for (const step of buildQualitySteps(mode)) {
        runStep(step, gateEnv);
    }
    console.log(`[qa] ${mode} gate passed.`);
}

function main() {
    runQualityGate(parseArgs(process.argv.slice(2)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main();
    } catch (error) {
        console.error(`[qa] ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
