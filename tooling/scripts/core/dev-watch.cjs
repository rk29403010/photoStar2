const { spawn } = require('node:child_process');
const { existsSync, watch } = require('node:fs');
const { extname, relative, resolve } = require('node:path');

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const LOG_PREFIX = '\x1b[35m[core-watch]\x1b[0m';
const DEDUPE_WINDOW_MS = 300;
const CLEAN_BUILD_MESSAGE = 'Found 0 errors. Watching for file changes.';
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;
const WATCH_ROOTS = [
    resolve(REPO_ROOT, 'src', 'boundary', 'contracts'),
    resolve(REPO_ROOT, 'src', 'boundary', 'transport'),
    resolve(REPO_ROOT, 'src', 'data'),
    resolve(REPO_ROOT, 'src', 'entrypoints', 'core'),
    resolve(REPO_ROOT, 'src', 'services'),
    resolve(REPO_ROOT, 'src', 'shared'),
];
const WATCH_FILES = [
    resolve(REPO_ROOT, 'package.json'),
    resolve(REPO_ROOT, 'tooling', 'config', 'tsconfig.core.json'),
];
const recentEvents = new Map();
const watchers = [];
let runtimeProcess = null;
let runtimeRestartInFlight = Promise.resolve();
const POST_COMPILE_SCRIPT = resolve(REPO_ROOT, 'tooling', 'scripts', 'core', 'post-compile.cjs');
const RUNTIME_WRAPPER_SCRIPT = resolve(REPO_ROOT, 'tooling', 'scripts', 'core', 'run-compiled-core.cjs');

function toDisplayPath(filePath) {
    return relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function shouldLogPath(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (
        normalizedPath.includes('/dist/')
        || normalizedPath.includes('/core/dist/')
        || normalizedPath.includes('/core/node_modules/')
        || normalizedPath.includes('/node_modules/')
        || normalizedPath.includes('/.worktrees/')
        || normalizedPath.includes('/.git/')
        || normalizedPath.includes('/.vscode/')
        || normalizedPath.includes('/.idea/')
        || normalizedPath.includes('/src-tauri/target/')
        || normalizedPath.includes('/src-tauri/gen/')
        || normalizedPath.includes('/src-tauri/binaries/')
        || normalizedPath.includes('/deployments/desktop/tauri/target/')
        || normalizedPath.includes('/deployments/desktop/tauri/gen/')
        || normalizedPath.includes('/deployments/desktop/tauri/binaries/')
    ) {
        return false;
    }

    const extension = extname(normalizedPath).toLowerCase();
    return extension === '.ts' || extension === '.tsx' || extension === '.json';
}

function logChange(eventType, filePath) {
    if (!filePath || !shouldLogPath(filePath)) {
        return;
    }

    const displayPath = toDisplayPath(filePath);
    const dedupeKey = `${eventType}:${displayPath}`;
    const now = Date.now();
    const lastLoggedAt = recentEvents.get(dedupeKey) ?? 0;
    if (now - lastLoggedAt < DEDUPE_WINDOW_MS) {
        return;
    }

    recentEvents.set(dedupeKey, now);
    console.log(`${LOG_PREFIX} ${eventType}: ${displayPath}`);
}

function addWatcher(watcher) {
    watchers.push(watcher);
    watcher.on('error', (error) => {
        console.error(`${LOG_PREFIX} watcher error:`, error);
    });
}

function watchDirectory(directoryPath) {
    if (!existsSync(directoryPath)) {
        return;
    }

    addWatcher(watch(
        directoryPath,
        { recursive: process.platform === 'win32' },
        (eventType, filename) => {
            if (!filename) {
                return;
            }

            logChange(eventType, resolve(directoryPath, filename.toString()));
        }
    ));
}

function watchFile(filePath) {
    if (!existsSync(filePath)) {
        return;
    }

    addWatcher(watch(filePath, (eventType) => {
        logChange(eventType, filePath);
    }));
}

function closeWatchers() {
    for (const watcher of watchers) {
        watcher.close();
    }
}

function getTscWatchEntry() {
    return require.resolve('tsc-watch/dist/lib/tsc-watch.js', { paths: [REPO_ROOT] });
}

function createRuntimeEnv() {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    delete env.VSCODE_INSPECTOR_OPTIONS;
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
}

function awaitChildExit(child) {
    return new Promise((resolveExit) => {
        child.once('exit', () => resolveExit());
    });
}

function runPostCompileStep() {
    return new Promise((resolveStep, rejectStep) => {
        const child = spawn(process.execPath, [POST_COMPILE_SCRIPT], {
            cwd: REPO_ROOT,
            stdio: 'inherit',
            env: process.env,
        });

        child.on('error', rejectStep);
        child.on('exit', (code, signal) => {
            if (signal) {
                rejectStep(new Error(`post-compile terminated by signal ${signal}`));
                return;
            }

            if ((code ?? 0) !== 0) {
                rejectStep(new Error(`post-compile exited with code ${code}`));
                return;
            }

            resolveStep();
        });
    });
}

async function stopRuntimeProcess() {
    if (!runtimeProcess) {
        return;
    }

    const child = runtimeProcess;
    runtimeProcess = null;
    child.kill('SIGTERM');
    await awaitChildExit(child);
}

function spawnRuntimeProcess() {
    const child = spawn(
        process.execPath,
        [RUNTIME_WRAPPER_SCRIPT],
        {
            cwd: REPO_ROOT,
            stdio: 'inherit',
            env: createRuntimeEnv(),
        }
    );

    child.on('error', (error) => {
        console.error(`${LOG_PREFIX} failed to start compiled backend:`, error);
    });

    child.on('exit', (code, signal) => {
        if (runtimeProcess !== child) {
            return;
        }

        runtimeProcess = null;
        if (signal === 'SIGTERM') {
            return;
        }

        console.error(`${LOG_PREFIX} compiled backend exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'none'})`);
    });

    runtimeProcess = child;
}

function restartRuntimeProcess() {
    runtimeRestartInFlight = runtimeRestartInFlight.then(async () => {
        await stopRuntimeProcess();
        await runPostCompileStep();
        spawnRuntimeProcess();
    }).catch((error) => {
        console.error(`${LOG_PREFIX} failed to restart compiled backend:`, error);
    });

    return runtimeRestartInFlight;
}

function normalizeCompilerLine(line) {
    return line.replace(ANSI_ESCAPE_PATTERN, '').trim();
}

function createCompilerOutputHandler(write) {
    let buffer = '';

    return (chunk) => {
        const text = chunk.toString();
        write(text);
        buffer += text;

        let lineBreakIndex = buffer.indexOf('\n');
        while (lineBreakIndex !== -1) {
            const line = buffer.slice(0, lineBreakIndex);
            buffer = buffer.slice(lineBreakIndex + 1);

            if (normalizeCompilerLine(line).includes(CLEAN_BUILD_MESSAGE)) {
                void restartRuntimeProcess();
            }

            lineBreakIndex = buffer.indexOf('\n');
        }
    };
}

function spawnCompiler() {
    const child = spawn(
        process.execPath,
        [
            getTscWatchEntry(),
            '-p',
            'tooling/config/tsconfig.core.json',
            '--noClear',
        ],
        {
            cwd: REPO_ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env,
        }
    );

    child.stdout.on('data', createCompilerOutputHandler((text) => process.stdout.write(text)));
    child.stderr.on('data', createCompilerOutputHandler((text) => process.stderr.write(text)));

    child.on('error', (error) => {
        console.error(`${LOG_PREFIX} failed to start compiler:`, error);
        closeWatchers();
        void stopRuntimeProcess();
        process.exit(1);
    });

    child.on('exit', (code, signal) => {
        closeWatchers();
        void stopRuntimeProcess();
        if (signal) {
            process.kill(process.pid, signal);
            return;
        }
        process.exit(code ?? 0);
    });

    return child;
}

WATCH_ROOTS.forEach(watchDirectory);
WATCH_FILES.forEach(watchFile);

const compiler = spawnCompiler();

function shutdown(signal) {
    closeWatchers();
    void stopRuntimeProcess();
    compiler.kill(signal);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
