#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const pnpmExecutable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const useShellForPnpm = process.platform === 'win32';
const quickMode = process.argv.includes('--quick');
const typechecksOnly = process.argv.includes('--typechecks-only');

const typecheckSteps = [
    { label: 'pnpm run typecheck:compat', command: pnpmExecutable, args: ['pnpm', 'run', 'typecheck:compat'], shell: useShellForPnpm },
    { label: 'pnpm run typecheck:native', command: pnpmExecutable, args: ['pnpm', 'run', 'typecheck:native'], shell: useShellForPnpm },
];

const quickSteps = [
    { label: 'read app shell x500', command: process.execPath, args: ['-e', "const fs=require('node:fs'); for (let index = 0; index < 500; index += 1) { fs.readFileSync('src/ui/App.tsx', 'utf8'); }"] },
    { label: 'pnpm run lint:fast', command: pnpmExecutable, args: ['pnpm', 'run', 'lint:fast'], shell: useShellForPnpm },
    { label: 'pnpm run quality:changed', command: pnpmExecutable, args: ['pnpm', 'run', 'quality:changed'], shell: useShellForPnpm },
];

const fullSteps = [
    { label: 'read app shell x500', command: process.execPath, args: ['-e', "const fs=require('node:fs'); for (let index = 0; index < 500; index += 1) { fs.readFileSync('src/ui/App.tsx', 'utf8'); }"] },
    { label: 'pnpm run lint:fast', command: pnpmExecutable, args: ['pnpm', 'run', 'lint:fast'], shell: useShellForPnpm },
    { label: 'pnpm run lint', command: pnpmExecutable, args: ['pnpm', 'run', 'lint'], shell: useShellForPnpm },
    ...typecheckSteps,
    { label: 'pnpm run quality:changed', command: pnpmExecutable, args: ['pnpm', 'run', 'quality:changed'], shell: useShellForPnpm },
];

function getBenchmarkSteps() {
    if (typechecksOnly) {
        return typecheckSteps;
    }
    return quickMode ? quickSteps : fullSteps;
}

function getBenchmarkMode() {
    if (typechecksOnly) {
        return 'typecheck';
    }
    return quickMode ? 'quick' : 'full';
}

function runStep(step) {
    const startedAt = performance.now();
    const result = spawnSync(step.command, step.args, {
        cwd: workspaceRoot,
        stdio: 'inherit',
        shell: step.shell ?? false,
    });
    const durationMs = performance.now() - startedAt;

    if ((result.status ?? 1) !== 0) {
        throw new Error(`${step.label} failed after ${Math.round(durationMs)}ms`);
    }

    return Math.round(durationMs);
}

function main() {
    const startedAt = performance.now();

    const benchmarkMode = getBenchmarkMode();
    console.log(`[benchmark-quality] Running ${benchmarkMode} benchmark in ${workspaceRoot}`);
    for (const step of getBenchmarkSteps()) {
        console.log(`[benchmark-quality] Starting ${step.label}`);
        const durationMs = runStep(step);
        console.log(`[benchmark-quality] ${step.label}: ${durationMs}ms`);
    }

    const totalDurationMs = Math.round(performance.now() - startedAt);
    console.log(`[benchmark-quality] Total: ${totalDurationMs}ms`);
}

try {
    main();
} catch (error) {
    console.error(`[benchmark-quality] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
