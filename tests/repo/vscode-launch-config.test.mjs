import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath) {
    return JSON.parse(readFileSync(path.join(workspaceRoot, relativePath), 'utf8'));
}

test('VS Code launch config avoids deprecated Chrome debugger entries and stale hardcoded Vite ports', () => {
    const launch = readJson('.vscode/launch.json');

    assert.equal(launch.configurations.some((entry) => entry.type === 'pwa-chrome'), false);
    assert.equal(JSON.stringify(launch).includes('http://localhost:5173'), false);
    assert.equal(launch.configurations.some((entry) => entry.name === 'Start Desktop App (Tauri)'), false);
});

test('VS Code node launchers use debugWithChrome so they attach to the URL reported by Vite', () => {
    const launch = readJson('.vscode/launch.json');
    const nodeLaunchers = launch.configurations.filter((entry) => entry.type === 'node' && entry.serverReadyAction);

    assert.ok(nodeLaunchers.length >= 1, 'expected node launchers with serverReadyAction');
    for (const launcher of nodeLaunchers) {
        assert.equal(launcher.serverReadyAction.action, 'debugWithChrome');
        assert.equal(launcher.serverReadyAction.pattern, 'Local:\\s+(https?://\\S+)');
        assert.equal(launcher.serverReadyAction.webRoot, '${workspaceFolder}');
    }
});

test('VS Code default web and desktop runtime launchers use the quiet scripts and keep a separate verbose HMR option', () => {
    const launch = readJson('.vscode/launch.json');
    const webLauncher = launch.configurations.find((entry) => entry.name === '🚀 Web Dev (Vite UI + Core + Chrome Debug)');
    const desktopRuntimeLauncher = launch.configurations.find((entry) => entry.name === '🧩 Desktop Runtime (UI + Core + Chrome Debug)');
    const verboseLauncher = launch.configurations.find((entry) => entry.name === '🧪 Desktop Runtime (Verbose HMR Logs)');
    const killPortsLauncher = launch.configurations.find((entry) => entry.name === '🧹 Kill Dev Ports');

    assert.deepEqual(webLauncher?.runtimeArgs, ['run', 'dev:desktop-runtime']);
    assert.deepEqual(desktopRuntimeLauncher?.runtimeArgs, ['run', 'dev:desktop-runtime']);
    assert.deepEqual(verboseLauncher?.runtimeArgs, ['run', 'dev:desktop-runtime:debug']);
    assert.deepEqual(killPortsLauncher?.runtimeArgs, ['run', 'dev:kill-ports']);
});

test('.gitignore allows the shared VS Code launcher to be committed', () => {
    const gitignore = readFileSync(path.join(workspaceRoot, '.gitignore'), 'utf8');

    assert.match(gitignore, /!\.vscode\/launch\.json/);
});
