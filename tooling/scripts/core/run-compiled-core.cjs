const { spawn } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const compiledEntry = path.join(repoRoot, 'dist', 'core', 'src', 'entrypoints', 'core', 'main.js');

function createRuntimeEnv() {
    const env = { ...process.env };

    // VS Code's js-debug bootloader can leak into child Node processes launched
    // from a debugged npm script. The compiled backend should run as a normal
    // process so it can keep the dev bridge on port 5174 alive.
    delete env.NODE_OPTIONS;
    delete env.VSCODE_INSPECTOR_OPTIONS;
    delete env.ELECTRON_RUN_AS_NODE;

    return env;
}

const child = spawn(process.execPath, [compiledEntry], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: createRuntimeEnv(),
});

child.on('error', (error) => {
    console.error('[core-runtime] failed to start compiled backend service:', error);
    process.exit(1);
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }

    process.exit(code ?? 0);
});

function shutdown(signal) {
    if (!child.killed) {
        child.kill(signal);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
