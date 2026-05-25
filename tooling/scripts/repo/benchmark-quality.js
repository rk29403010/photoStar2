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

const steps = quickMode ? [
    { label: 'read app shell x500', command: process.execPath, args: ['-e', "const fs=require('node:fs'); for (let index = 0; index < 500; index += 1) { fs.readFileSync('src/ui/App.tsx', 'utf8'); }"] },
    { label: 'pnpm run lint:fast', command: pnpmExecutable, args: ['pnpm', 'run', 'lint:fast'], shell: useShellForPnpm },
    { label: 'pnpm run quality:changed', command: pnpmExecutable, args: ['pnpm', 'run', 'quality:changed'], shell: useShellForPnpm },
] : [
    { label: 'read app shell x500', command: process.execPath, args: ['-e', "const fs=require('node:fs'); for (let index = 0; index < 500; index += 1) { fs.readFileSync('src/ui/App.tsx', 'utf8'); }"] },
    { label: 'pnpm run lint:fast', command: pnpmExecutable, args: ['pnpm', 'run', 'lint:fast'], shell: useShellForPnpm },
    { label: 'pnpm run lint', command: pnpmExecutable, args: ['pnpm', 'run', 'lint'], shell: useShellForPnpm },
    { label: 'pnpm run typecheck', command: pnpmExecutable, args: ['pnpm', 'run', 'typecheck'], shell: useShellForPnpm },
    { label: 'pnpm run typecheck:core', command: pnpmExecutable, args: ['pnpm', 'run', 'typecheck:core'], shell: useShellForPnpm },
    { label: 'pnpm run quality:changed', command: pnpmExecutable, args: ['pnpm', 'run', 'quality:changed'], shell: useShellForPnpm },
];

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

    console.log(`[benchmark-quality] Running ${quickMode ? 'quick' : 'full'} benchmark in ${workspaceRoot}`);
    for (const step of steps) {
        console.log(`[benchmark-quality] Starting ${step.label}`);
        const durationMs = runStep(step);
        console.log(`[benchmark-quality] ${step.label}: ${durationMs}ms`);
    }

    console.log(`[benchmark-quality] Total: ${Math.round(performance.now() - startedAt)}ms`);
}

try {
    main();
} catch (error) {
    console.error(`[benchmark-quality] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
