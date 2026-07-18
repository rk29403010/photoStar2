#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getTaskkillExecutable, runCommandSync } from './process-invocation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const webWatchScript = path.resolve(workspaceRoot, 'tooling', 'scripts', 'web', 'dev-watch.js');
const coreWatchScript = path.resolve(workspaceRoot, 'tooling', 'scripts', 'core', 'dev-watch.cjs');

const PREFIX_BY_LABEL = {
    web: '\x1b[36m[web]\x1b[0m',
    core: '\x1b[35m[core]\x1b[0m',
};

const PROFILE_ARGS = {
    default: [],
    desktop: ['--mode', 'desktop-dev'],
    debug: ['--debug', 'hmr'],
};

function parseArgs(argv) {
    const parsed = { _: [] };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
            parsed._.push(token);
            continue;
        }

        const key = token.slice(2);
        const nextToken = argv[index + 1];
        if (!nextToken || nextToken.startsWith('--')) {
            parsed[key] = true;
            continue;
        }

        parsed[key] = nextToken;
        index += 1;
    }

    return parsed;
}

function formatPrefixedLine(label, line) {
    const prefix = PREFIX_BY_LABEL[label] ?? `[${label}]`;
    return `${prefix} ${line}\n`;
}

function createPrefixedOutputHandler({ label, write }) {
    let buffer = '';

    return (chunk) => {
        buffer += chunk.toString();

        let lineBreakIndex = buffer.indexOf('\n');
        while (lineBreakIndex !== -1) {
            const line = buffer.slice(0, lineBreakIndex);
            buffer = buffer.slice(lineBreakIndex + 1);
            write(formatPrefixedLine(label, line));
            lineBreakIndex = buffer.indexOf('\n');
        }
    };
}

function buildManagedProcesses(profile) {
    const webArgs = PROFILE_ARGS[profile];
    if (!webArgs) {
        throw new Error(`Unsupported managed dev profile: ${profile}`);
    }

    return [
        {
            label: 'web',
            command: process.execPath,
            args: [webWatchScript, ...webArgs],
        },
        {
            label: 'core',
            command: process.execPath,
            args: [coreWatchScript],
        },
    ];
}

function killChildTree(child) {
    if (!child?.pid) {
        return;
    }

    if (process.platform === 'win32') {
        runCommandSync({
            command: getTaskkillExecutable(),
            args: ['/PID', String(child.pid), '/T', '/F'],
            cwd: workspaceRoot,
            stdio: 'ignore',
        });
        return;
    }

    try {
        child.kill('SIGTERM');
    } catch (error) {
        if (error.code !== 'ESRCH') {
            console.warn(`[managed-dev-runtime] Could not stop child ${child.pid}: ${error.message}`);
        }
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const profile = typeof args.profile === 'string' ? args.profile.trim() : 'desktop';
    const managedProcesses = buildManagedProcesses(profile);
    console.log(`[managed-dev-runtime] Starting ${profile} profile in ${workspaceRoot}`);
    const children = managedProcesses.map((processConfig) => {
        const child = spawn(processConfig.command, processConfig.args, {
            cwd: workspaceRoot,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
            windowsHide: process.platform === 'win32',
        });
        console.log(`[managed-dev-runtime] ${processConfig.label} pid=${child.pid ?? 'pending'} command=${processConfig.command} ${processConfig.args.join(' ')}`);

        child.stdout.on('data', createPrefixedOutputHandler({
            label: processConfig.label,
            write: (text) => process.stdout.write(text),
        }));
        child.stderr.on('data', createPrefixedOutputHandler({
            label: processConfig.label,
            write: (text) => process.stderr.write(text),
        }));

        child.on('error', (error) => {
            console.error(formatPrefixedLine(processConfig.label, `failed to start: ${error.message}`).trimEnd());
            children.forEach(killChildTree);
            process.exit(1);
        });

        return child;
    });

    let exitHandled = false;

    function shutdown(signal = 'SIGTERM') {
        console.log(`[managed-dev-runtime] Shutting down after ${signal}`);
        children.forEach((child) => killChildTree(child));
    }

    for (const child of children) {
        child.on('exit', (code, signal) => {
            if (exitHandled) {
                return;
            }

            exitHandled = true;
            shutdown(signal ?? 'SIGTERM');
            if (signal) {
                process.kill(process.pid, signal);
                return;
            }

            process.exit(code ?? 0);
        });
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
