#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSpawnInvocation, getSpawnOptions, getTaskkillExecutable, runCommandSync } from './process-invocation.js';
import { resolveDevRuntimePorts } from './dev-runtime-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const sessionFilePath = path.join(workspaceRoot, '.local', 'dev-session.json');
const managedRuntimeScript = path.resolve(workspaceRoot, 'tooling', 'scripts', 'repo', 'managed-dev-runtime.js');
const defaultResumeScript = 'dev:desktop-runtime';

const MANAGED_DEV_SCRIPTS = {
    dev: {
        command: process.execPath,
        args: [managedRuntimeScript, '--profile', 'default'],
    },
    'dev:desktop-runtime': {
        command: process.execPath,
        args: [managedRuntimeScript, '--profile', 'desktop'],
    },
    'dev:desktop-runtime:debug': {
        command: process.execPath,
        args: [managedRuntimeScript, '--profile', 'debug'],
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

export function buildManagedPortCleanupInvocation({
    env = process.env,
    cwd = workspaceRoot,
    platform = process.platform,
} = {}) {
    const { webPort, backendPort } = resolveDevRuntimePorts(env, cwd);
    const portList = `${webPort},${backendPort}`;
    if (platform === 'win32') {
        return {
            command: 'powershell.exe',
            args: [
                '-NoProfile',
                '-Command',
                `$pids=(Get-NetTCPConnection -LocalPort ${portList} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); if ($pids) { Stop-Process -Id $pids -Force -ErrorAction SilentlyContinue }`,
            ],
        };
    }

    return {
        command: 'sh',
        args: ['-lc', `lsof -ti:${portList.replace(',', ',')} | xargs -r kill -9`],
    };
}

export function buildLegacyManagedProcessCleanupInvocation({
    cwd = workspaceRoot,
    platform = process.platform,
} = {}) {
    if (platform !== 'win32') {
        return null;
    }

    const windowsCwd = cwd.replaceAll('/', '\\');

    return {
        command: 'powershell.exe',
        args: [
            '-NoProfile',
            '-Command',
            `$pids=(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { ($_.CommandLine -like '*${windowsCwd}*concurrently.js*') -or ($_.CommandLine -like '*npm-cli.js*run dev:core*') -or ($_.CommandLine -like '*npm-cli.js*run dev:web:watch*') -or ($_.CommandLine -like '*pnpm*run dev:core*') -or ($_.CommandLine -like '*pnpm*run dev:web:watch*') } | Select-Object -ExpandProperty ProcessId -Unique); if ($pids) { Stop-Process -Id $pids -Force -ErrorAction SilentlyContinue }`,
        ],
    };
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

function cleanupManagedPorts({
    env = process.env,
    cwd = workspaceRoot,
    platform = process.platform,
}) {
    const legacyInvocation = buildLegacyManagedProcessCleanupInvocation({ cwd, platform });
    if (legacyInvocation) {
        runCommandSync({
            command: legacyInvocation.command,
            args: legacyInvocation.args,
            cwd,
            env,
            stdio: 'ignore',
            platform,
        });
    }

    const invocation = buildManagedPortCleanupInvocation({ env, cwd, platform });
    runCommandSync({
        command: invocation.command,
        args: invocation.args,
        cwd,
        env,
        stdio: 'ignore',
        platform,
    });
}

export function getManagedSpawnOptions({
    stdio,
    detached = false,
    env = process.env,
    platform = process.platform,
} = {}) {
    return getSpawnOptions({
        cwd: workspaceRoot,
        env,
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
    env = process.env,
    platform = process.platform,
}) {
    return buildSpawnInvocation({
        command,
        args,
        cwd: workspaceRoot,
        env,
        stdio,
        detached,
        platform,
    });
}

export function createManagedDevEnv(env = process.env, cwd = workspaceRoot) {
    const { webPort, backendPort } = resolveDevRuntimePorts(env, cwd);
    return {
        ...env,
        VITE_PORT: String(webPort),
        VITE_BACKEND_PORT: String(backendPort),
    };
}

export function buildManagedResumeInvocation({
    scriptName,
    env = process.env,
    cwd = workspaceRoot,
    platform = process.platform,
}) {
    const { command, args } = getManagedScriptConfig(scriptName);

    return buildSpawnInvocation({
        command,
        args,
        cwd,
        env,
        stdio: 'ignore',
        detached: true,
        platform,
    });
}

function spawnManagedScript(scriptName) {
    const scriptConfig = MANAGED_DEV_SCRIPTS[scriptName];
    if (!scriptConfig) {
        throw new Error(`Unsupported managed dev script: ${scriptName}`);
    }

    const managedEnv = createManagedDevEnv();
    cleanupManagedPorts({
        env: managedEnv,
        cwd: workspaceRoot,
    });
    const invocation = buildManagedSpawnInvocation({
        command: scriptConfig.command,
        args: scriptConfig.args,
        stdio: 'inherit',
        env: managedEnv,
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
    cleanupManagedPorts({ cwd: workspaceRoot });

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

    const managedEnv = createManagedDevEnv();
    cleanupManagedPorts({
        env: managedEnv,
        cwd: workspaceRoot,
    });
    const invocation = buildManagedResumeInvocation({
        scriptName: scriptToRun,
        env: managedEnv,
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
