#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const useShellForNpm = process.platform === 'win32';
const quickMode = process.argv.includes('--quick');

const steps = quickMode ? [
    { label: 'read app shell x500', command: process.execPath, args: ['-e', "const fs=require('node:fs'); for (let index = 0; index < 500; index += 1) { fs.readFileSync('src/ui/App.tsx', 'utf8'); }"] },
    { label: 'npm run lint:fast', command: npmExecutable, args: ['run', 'lint:fast'], shell: useShellForNpm },
    { label: 'npm run quality:changed', command: npmExecutable, args: ['run', 'quality:changed'], shell: useShellForNpm },
] : [
    { label: 'read app shell x500', command: process.execPath, args: ['-e', "const fs=require('node:fs'); for (let index = 0; index < 500; index += 1) { fs.readFileSync('src/ui/App.tsx', 'utf8'); }"] },
    { label: 'npm run lint:fast', command: npmExecutable, args: ['run', 'lint:fast'], shell: useShellForNpm },
    { label: 'npm run lint', command: npmExecutable, args: ['run', 'lint'], shell: useShellForNpm },
    { label: 'npm run typecheck', command: npmExecutable, args: ['run', 'typecheck'], shell: useShellForNpm },
    { label: 'npm run typecheck:core', command: npmExecutable, args: ['run', 'typecheck:core'], shell: useShellForNpm },
    { label: 'npm run quality:changed', command: npmExecutable, args: ['run', 'quality:changed'], shell: useShellForNpm },
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
