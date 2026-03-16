import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDesktopDevTauriConfig } from '../../tooling/scripts/repo/tauri-dev-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath) {
    return JSON.parse(readFileSync(path.join(workspaceRoot, relativePath), 'utf8'));
}

test('buildDesktopDevTauriConfig applies worktree-aware web and backend ports', () => {
    const template = readJson('deployments/desktop/tauri/tauri.desktop-dev.conf.json');

    const config = buildDesktopDevTauriConfig({
        templateConfig: template,
        env: {},
        cwd: 'C:/Users/robin/Projects/photoStar2/.worktrees/feature-a',
    });

    assert.notEqual(config.build.devUrl, 'http://localhost:5173');
    assert.match(config.build.devUrl, /^http:\/\/localhost:\d+$/);
    assert.match(config.app.security.csp, /ws:\/\/localhost:\d+/);
    assert.equal(config.app.security.csp.includes('ws://localhost:5174'), false);
    assert.equal(config.app.security.csp.includes('http://localhost:5174'), false);
});

test('buildDesktopDevTauriConfig respects explicit port overrides', () => {
    const template = readJson('deployments/desktop/tauri/tauri.desktop-dev.conf.json');

    const config = buildDesktopDevTauriConfig({
        templateConfig: template,
        env: {
            VITE_PORT: '6203',
            VITE_BACKEND_PORT: '6204',
        },
        cwd: 'C:/Users/robin/Projects/photoStar2/.worktrees/feature-a',
    });

    assert.equal(config.build.devUrl, 'http://localhost:6203');
    assert.match(config.app.security.csp, /ws:\/\/localhost:6204/);
    assert.match(config.app.security.csp, /http:\/\/127\.0\.0\.1:6204/);
});
