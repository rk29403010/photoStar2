const { spawn } = require('node:child_process');
const { existsSync, watch } = require('node:fs');
const { extname, relative, resolve } = require('node:path');

const CORE_DIR = resolve(__dirname, '..');
const WORKSPACE_DIR = resolve(CORE_DIR, '..');
const LOG_PREFIX = '\x1b[35m[core-watch]\x1b[0m';
const DEDUPE_WINDOW_MS = 300;
const WATCH_ROOTS = [
    resolve(CORE_DIR, 'src'),
    resolve(WORKSPACE_DIR, 'shared'),
];
const WATCH_FILES = [
    resolve(CORE_DIR, 'tsconfig.json'),
];
const recentEvents = new Map();
const watchers = [];

function toDisplayPath(filePath) {
    return relative(WORKSPACE_DIR, filePath).replace(/\\/g, '/');
}

function shouldLogPath(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (
        normalizedPath.includes('/dist/')
        || normalizedPath.includes('/node_modules/')
        || normalizedPath.includes('/.git/')
        || normalizedPath.includes('/.vscode/')
        || normalizedPath.includes('/.idea/')
        || normalizedPath.includes('/src-tauri/target/')
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
    return require.resolve('tsc-watch/dist/lib/tsc-watch.js');
}

function spawnCompiler() {
    const child = spawn(
        process.execPath,
        [getTscWatchEntry(), '--noClear', '--onSuccess', 'node dist/core/src/main.js'],
        {
            cwd: CORE_DIR,
            stdio: 'inherit',
            env: process.env,
        }
    );

    child.on('error', (error) => {
        console.error(`${LOG_PREFIX} failed to start compiler:`, error);
        closeWatchers();
        process.exit(1);
    });

    child.on('exit', (code, signal) => {
        closeWatchers();
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
    compiler.kill(signal);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
