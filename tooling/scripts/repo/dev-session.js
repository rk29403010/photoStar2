#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSpawnInvocation, getSpawnOptions, getTaskkillExecutable, runCommandSync } from './process-invocation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const sessionFilePath = path.join(workspaceRoot, '.local', 'dev-session.json');
const concurrentlyScript = path.resolve(
    workspaceRoot,
    'node_modules',
    'concurrently',
    'dist',
    'bin',
    'concurrently.js',
);
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const defaultResumeScript = 'dev:desktop-runtime';

const MANAGED_DEV_SCRIPTS = {
    dev: {
        command: process.execPath,
        args: [concurrentlyScript, '--names', 'web,core', '--prefix-colors', 'cyan.bold,magenta.bold', 'npm run dev:web:watch', 'npm run dev:core'],
    },
    'dev:desktop-runtime': {
        command: process.execPath,
        args: [concurrentlyScript, '--names', 'web,core', '--prefix-colors', 'cyan.bold,magenta.bold', 'npm run dev:web:watch:desktop', 'npm run dev:core'],
    },
    'dev:desktop-runtime:debug': {
        command: process.execPath,
        args: [concurrentlyScript, '--names', 'web,core', '--prefix-colors', 'cyan.bold,magenta.bold', 'npm run dev:web:watch:debug', 'npm run dev:core'],
    },
};

function ensureSessionDirectory() {
    mkdirSync(path.dirname(sessionFilePath), { recursive: true });
}

function readSession() {
    if (!existsSync(sessionFilePath)) {
        return null;
    }

    try {
        return JSON.parse(readFileSync(sessionFilePath, 'utf8'));
    } catch {
        return null;
    }
}

function writeSession(session) {
    ensureSessionDirectory();
    writeFileSync(sessionFilePath, `${JSON.stringify(session, null, 2)}\n`);
}

function updateSession(sessionPatch) {
    const current = readSession() ?? {};
    writeSession({ ...current, ...sessionPatch });
}

function clearSessionPid() {
    const current = readSession();
    if (!current) {
        return;
    }

    const { pid: _pid, ...rest } = current;
    writeSession(rest);
}

function isManagedScript(scriptName) {
    return Object.hasOwn(MANAGED_DEV_SCRIPTS, scriptName);
}

export function getResumeScript(session) {
    const lastScript = session?.lastScript;
    return isManagedScript(lastScript) ? lastScript : defaultResumeScript;
}

export function getManagedScriptConfig(scriptName) {
    const scriptConfig = MANAGED_DEV_SCRIPTS[scriptName];
    if (!scriptConfig) {
        throw new Error(`Unsupported managed dev script: ${scriptName}`);
    }

    return {
        command: scriptConfig.command,
        args: [...scriptConfig.args],
    };
}

export function getManagedSpawnOptions({
    stdio,
    detached = false,
    platform = process.platform,
} = {}) {
    return getSpawnOptions({
        cwd: workspaceRoot,
        env: process.env,
        stdio,
        detached,
        platform,
    });
}

export function buildManagedSpawnInvocation({
    command,
    args,
    stdio,
    detached = false,
    platform = process.platform,
}) {
    return buildSpawnInvocation({
        command,
        args,
        cwd: workspaceRoot,
        env: process.env,
        stdio,
        detached,
        platform,
    });
}

function spawnManagedScript(scriptName) {
    const scriptConfig = MANAGED_DEV_SCRIPTS[scriptName];
    if (!scriptConfig) {
        throw new Error(`Unsupported managed dev script: ${scriptName}`);
    }

    const invocation = buildManagedSpawnInvocation({
        command: scriptConfig.command,
        args: scriptConfig.args,
        stdio: 'inherit',
    });
    return spawn(invocation.command, invocation.args, invocation.options);
}

function runManagedScript(scriptName) {
    const child = spawnManagedScript(scriptName);
    updateSession({
        lastScript: scriptName,
        pid: child.pid,
        startedAt: new Date().toISOString(),
    });

    child.on('exit', () => {
        const session = readSession();
        if (session?.pid === child.pid) {
            clearSessionPid();
        }
    });

    child.on('error', (error) => {
        console.error(`[dev-session] Failed to start ${scriptName}:`, error);
        process.exit(1);
    });

    child.on('exit', (code, signal) => {
        if (signal) {
            process.kill(process.pid, signal);
            return;
        }

        process.exit(code ?? 0);
    });
}

function killPidTree(pid) {
    if (!pid) {
        return false;
    }

    if (process.platform === 'win32') {
        const result = runCommandSync({
            command: getTaskkillExecutable(),
            args: ['/PID', String(pid), '/T', '/F'],
            cwd: workspaceRoot,
            stdio: 'ignore',
        });

        return (result.status ?? 1) === 0;
    }

    try {
        process.kill(-pid, 'SIGTERM');
        return true;
    } catch {
        return false;
    }
}

function pauseManagedSession() {
    const session = readSession();
    const killed = killPidTree(session?.pid);
    clearSessionPid();

    if (killed) {
        console.log(`[dev-session] Paused ${session?.lastScript ?? 'dev session'}.`);
        return;
    }

    console.log('[dev-session] No managed dev session was running.');
}

function resumeManagedSession(requestedScript) {
    const scriptToRun = requestedScript && isManagedScript(requestedScript)
        ? requestedScript
        : getResumeScript(readSession());

    const invocation = buildManagedSpawnInvocation({
        command: npmExecutable,
        args: ['run', scriptToRun],
        stdio: 'ignore',
        detached: true,
    });
    const child = spawn(invocation.command, invocation.args, invocation.options);

    updateSession({
        lastScript: scriptToRun,
        pid: child.pid,
        startedAt: new Date().toISOString(),
    });
    child.unref();
    console.log(`[dev-session] Resumed ${scriptToRun} in the background.`);
}

function main() {
    const [command, argument] = process.argv.slice(2);

    if (command === 'run') {
        runManagedScript(argument);
        return;
    }

    if (command === 'pause') {
        pauseManagedSession();
        return;
    }

    if (command === 'resume') {
        resumeManagedSession(argument);
        return;
    }

    console.error('Usage: node tooling/scripts/repo/dev-session.js <run|pause|resume> [script]');
    process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
