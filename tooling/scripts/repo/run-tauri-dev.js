import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeDesktopDevTauriConfig } from './tauri-dev-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const tauriExecutable = path.resolve(
    workspaceRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
);

const generatedConfigPath = writeDesktopDevTauriConfig({
    cwd: workspaceRoot,
    env: process.env,
});

const child = spawn(tauriExecutable, ['dev', '--config', generatedConfigPath], {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }

    process.exit(code ?? 0);
});

child.on('error', (error) => {
    console.error(error);
    process.exit(1);
});
