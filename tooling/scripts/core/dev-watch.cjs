const { spawn } = require('node:child_process');
const { existsSync, watch } = require('node:fs');
const { extname, relative, resolve } = require('node:path');

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CORE_DEV_TSCONFIG = 'tooling/config/tsconfig.core.dev.json';
const LOG_PREFIX = '\x1b[35m[core-watch]\x1b[0m';
const CLEAN_BUILD_MESSAGE = 'Found 0 errors. Watching for file changes.';
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001b\[[0-9;]*m`, 'g');
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
    resolve(REPO_ROOT, CORE_DEV_TSCONFIG),
];
const watchers = [];
let runtimeProcess = null;
let runtimeRestartInFlight = Promise.resolve();
const POST_COMPILE_SCRIPT = resolve(REPO_ROOT, 'tooling', 'scripts', 'core', 'post-compile.cjs');
const RUNTIME_WRAPPER_SCRIPT = resolve(REPO_ROOT, 'tooling', 'scripts', 'core', 'run-compiled-core.cjs');
const FAST_LOOP_OXLINT_CONFIG = resolve(REPO_ROOT, '.oxlintrc.fast-loop.json');
const FAST_LOOP_OXLINT_SCRIPT = resolve(REPO_ROOT, 'node_modules', 'oxlint', 'bin', 'oxlint');
const IGNORED_PATH_SEGMENTS = [
    '/dist/',
    '/core/dist/',
    '/core/node_modules/',
    '/node_modules/',
    '/.worktrees/',
    '/.git/',
    '/.vscode/',
    '/.idea/',
    '/src-tauri/target/',
    '/src-tauri/gen/',
    '/src-tauri/binaries/',
    '/deployments/desktop/tauri/target/',
    '/deployments/desktop/tauri/gen/',
    '/deployments/desktop/tauri/binaries/',
];

function toDisplayPath(filePath) {
    return relative(REPO_ROOT, filePath).replaceAll('\\', '/');
}

function isIgnoredPath(normalizedPath) {
    return IGNORED_PATH_SEGMENTS.some((segment) => normalizedPath.includes(segment));
}

function shouldLogPath(filePath) {
    const normalizedPath = `/${toDisplayPath(filePath)}`.replaceAll('\\', '/');
    if (isIgnoredPath(normalizedPath)) {
        return false;
    }

    const extension = extname(normalizedPath).toLowerCase();
    return extension === '.ts' || extension === '.tsx' || extension === '.json';
}

function createChangeBatchTracker() {
    const pendingFiles = new Set();

    return {
        recordFileChange(filePath) {
            if (!filePath || !shouldLogPath(filePath)) {
                return false;
            }

            pendingFiles.add(toDisplayPath(filePath));
            return true;
        },
        consumePendingFiles() {
            const files = [...pendingFiles];
            pendingFiles.clear();
            return files;
        },
    };
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
        (_eventType, filename) => {
            if (!filename) {
                return;
            }

            changeBatchTracker.recordFileChange(resolve(directoryPath, filename.toString()));
        }
    ));
}

function watchFile(filePath) {
    if (!existsSync(filePath)) {
        return;
    }

    addWatcher(watch(filePath, (eventType) => {
        if (eventType) {
            changeBatchTracker.recordFileChange(filePath);
        }
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

function getFastLintInvocation(files) {
    return {
        command: process.execPath,
        args: [
            FAST_LOOP_OXLINT_SCRIPT,
            '-c',
            FAST_LOOP_OXLINT_CONFIG,
            ...files,
        ],
        configPath: FAST_LOOP_OXLINT_CONFIG,
        scriptPath: FAST_LOOP_OXLINT_SCRIPT,
    };
}

function createFastLintExitHandler({
    warn = (message) => console.warn(message),
    onResolve,
    onReject,
}) {
    return (code, signal) => {
        if (signal) {
            onReject(new Error(`fast lint terminated by signal ${signal}`));
            return;
        }

        if ((code ?? 0) !== 0) {
            warn(`${LOG_PREFIX} fast lint reported issues; continuing backend restart.`);
        }

        onResolve();
    };
}

function runFastLintForFiles(files) {
    if (!files || files.length === 0) {
        return Promise.resolve();
    }

    return new Promise((resolveStep, rejectStep) => {
        const invocation = getFastLintInvocation(files);
        const handleExit = createFastLintExitHandler({
            onResolve: resolveStep,
            onReject: rejectStep,
        });
        const child = spawn(invocation.command, invocation.args, {
            cwd: REPO_ROOT,
            stdio: 'inherit',
            env: process.env,
            shell: false,
            windowsHide: process.platform === 'win32',
        });

        child.on('error', rejectStep);
        child.on('exit', handleExit);
    });
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

function restartRuntimeProcess(changedFiles = []) {
    runtimeRestartInFlight = runtimeRestartInFlight.then(async () => {
        await runFastLintForFiles(changedFiles);
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

function createCompilerOutputHandler({
    changeBatchTracker: tracker = changeBatchTracker,
    restartRuntimeProcess: restartProcess = restartRuntimeProcess,
    write,
}) {
    let buffer = '';

    return (chunk) => {
        buffer += chunk.toString();

        let lineBreakIndex = buffer.indexOf('\n');
        while (lineBreakIndex !== -1) {
            const line = buffer.slice(0, lineBreakIndex);
            buffer = buffer.slice(lineBreakIndex + 1);
            const normalizedLine = normalizeCompilerLine(line);

            if (normalizedLine.includes(CLEAN_BUILD_MESSAGE)) {
                const changedFiles = tracker.consumePendingFiles();
                if (changedFiles.length > 0) {
                    const fileLabel = changedFiles.length === 1 ? 'file' : 'files';
                    write(`${LOG_PREFIX} compiled ${changedFiles.length} changed ${fileLabel}; running fast lint.\n`);
                } else {
                    write(`${line}\n`);
                }
                void restartProcess(changedFiles);
            } else {
                write(`${line}\n`);
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
            CORE_DEV_TSCONFIG,
            '--noClear',
        ],
        {
            cwd: REPO_ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env,
        }
    );

    child.stdout.on('data', createCompilerOutputHandler({
        write: (text) => process.stdout.write(text),
    }));
    child.stderr.on('data', createCompilerOutputHandler({
        write: (text) => process.stderr.write(text),
    }));

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

const changeBatchTracker = createChangeBatchTracker();

function main() {
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
}

if (require.main === module) {
    main();
}

module.exports = {
    CLEAN_BUILD_MESSAGE,
    LOG_PREFIX,
    createChangeBatchTracker,
    createCompilerOutputHandler,
    createFastLintExitHandler,
    getFastLintInvocation,
    shouldLogPath,
};
