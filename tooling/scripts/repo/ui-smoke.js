#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';

import { getTaskkillExecutable, runCommandSync } from './process-invocation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const managedRuntimeScript = path.join(__dirname, 'managed-dev-runtime.js');
const RUNTIME_TIMEOUT_MS = 45_000;
const UI_READY_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 250;
const STARTUP_FAILURE_TEXT = 'Backend service failed to start.';

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

export function getBrowserCandidates({ env = process.env, platform = process.platform } = {}) {
    if (platform === 'win32') {
        const browserPath = path.win32;
        return unique([
            browserPath.join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            browserPath.join(env.ProgramFiles ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            browserPath.join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            browserPath.join(env.ProgramFiles ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ]);
    }

    return [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ];
}

export function resolveSmokeBrowser(options = {}) {
    const { env = process.env, exists = existsSync } = options;
    const explicitBrowser = env.UI_SMOKE_BROWSER?.trim();
    if (explicitBrowser) {
        return explicitBrowser;
    }

    return getBrowserCandidates(options).find((candidate) => exists(candidate)) ?? null;
}

export function buildSmokeRuntimeEnv({ env = process.env, webPort, backendPort }) {
    return {
        ...env,
        VITE_PORT: String(webPort),
        VITE_BACKEND_PORT: String(backendPort),
    };
}

function normalizePath(filePath) {
    return String(filePath).replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

export function shouldRunUiSmoke(changedPaths) {
    return changedPaths.some((filePath) => {
        const normalizedPath = normalizePath(filePath);
        return normalizedPath === 'package.json'
            || normalizedPath === 'vite.config.ts'
            || normalizedPath.startsWith('src/ui/')
            || normalizedPath.startsWith('src/entrypoints/')
            || normalizedPath.startsWith('src/boundary/')
            || normalizedPath.startsWith('src/contracts/')
            || normalizedPath.startsWith('src/data/')
            || normalizedPath.startsWith('src/services/')
            || normalizedPath.startsWith('src/shared/')
            || normalizedPath.startsWith('tooling/scripts/web/')
            || normalizedPath === 'tooling/scripts/repo/ui-smoke.js'
            || normalizedPath.endsWith('.css');
    });
}

export function isSmokeReadyState(state) {
    return state.rootVisible === true
        && state.loadingVisible === true
        && state.viteOverlayVisible === false
        && state.startupFailureVisible === false;
}

export function getSmokeFailureReason(state, failures) {
    if (failures.length > 0) {
        return failures.join('\n');
    }
    if (state.startupFailureVisible) {
        return STARTUP_FAILURE_TEXT;
    }
    if (state.viteOverlayVisible) {
        return 'Vite rendered an error overlay.';
    }
    if (!state.rootVisible) {
        return 'The application root was empty or not visible.';
    }
    return 'The application did not render its initial loading screen before the smoke-test timeout.';
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function runGitText(args, cwd = workspaceRoot) {
    const result = runCommandSync({
        command: process.platform === 'win32' ? 'git.exe' : 'git',
        args,
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return (result.status ?? 1) === 0 ? result.stdout.trim() : '';
}

export function resolveUiSmokeBase({ explicitBase = '', env = process.env, git = runGitText } = {}) {
    if (explicitBase) {
        return explicitBase;
    }
    if (env.QA_BASE_SHA) {
        return env.QA_BASE_SHA;
    }
    if (env.GITHUB_BASE_REF) {
        return `origin/${env.GITHUB_BASE_REF}`;
    }
    const branch = git(['branch', '--show-current']);
    if (branch && branch !== 'main' && branch !== 'master' && git(['rev-parse', '--verify', '--quiet', 'origin/main'])) {
        return 'origin/main';
    }
    return '';
}

export function getChangedPathsSinceBase(base, { git = runGitText } = {}) {
    if (!base) {
        return null;
    }
    const changed = git(['diff', '--name-only', `${base}...HEAD`]);
    return changed === '' ? [] : changed.split(/\r?\n/).filter(Boolean);
}

function reservePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close();
                reject(new Error('Unable to reserve a local smoke-test port.'));
                return;
            }
            server.close((error) => error ? reject(error) : resolve(address.port));
        });
    });
}

async function reserveRuntimePorts() {
    const webPort = await reservePort();
    let backendPort = await reservePort();
    while (backendPort === webPort) {
        backendPort = await reservePort();
    }
    return { webPort, backendPort };
}

function appendOutput(target, chunk) {
    const next = `${target.value}${chunk.toString()}`;
    target.value = next.length > 20_000 ? next.slice(-20_000) : next;
}

export function startOwnedRuntime({ cwd = workspaceRoot, env = process.env, webPort, backendPort, spawnProcess = spawn }) {
    const output = { value: '' };
    const child = spawnProcess(process.execPath, [managedRuntimeScript, '--profile', 'desktop'], {
        cwd,
        env: buildSmokeRuntimeEnv({ env, webPort, backendPort }),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: process.platform === 'win32',
    });
    child.stdout?.on('data', (chunk) => appendOutput(output, chunk));
    child.stderr?.on('data', (chunk) => appendOutput(output, chunk));
    return { child, output };
}

function canConnect(port) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host: '127.0.0.1', port });
        const finish = (ready) => {
            socket.destroy();
            resolve(ready);
        };
        socket.setTimeout(1_000);
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
        socket.once('timeout', () => finish(false));
    });
}

async function waitForPorts({ webPort, backendPort, timeoutMs = RUNTIME_TIMEOUT_MS }) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const [webReady, backendReady] = await Promise.all([canConnect(webPort), canConnect(backendPort)]);
        if (webReady && backendReady) {
            return;
        }
        await delay(POLL_INTERVAL_MS);
    }
    throw new Error(`Runtime did not become ready within ${timeoutMs / 1_000}s (web ${webPort}, backend ${backendPort}).`);
}

export function stopOwnedProcess(child, { platform = process.platform } = {}) {
    if (!child?.pid || child.exitCode !== null) {
        return;
    }
    if (platform === 'win32') {
        runCommandSync({
            command: getTaskkillExecutable(platform),
            args: ['/PID', String(child.pid), '/T', '/F'],
            cwd: workspaceRoot,
            stdio: 'ignore',
            platform,
        });
        return;
    }
    child.kill('SIGTERM');
}

function waitForProcessExit(child, timeoutMs = 5_000) {
    if (!child?.pid || child.exitCode !== null) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const timeout = setTimeout(resolve, timeoutMs);
        child.once('exit', () => {
            clearTimeout(timeout);
            resolve();
        });
    });
}

async function stopOwnedProcessAndWait(child) {
    stopOwnedProcess(child);
    await waitForProcessExit(child);
}

async function removeTemporaryProfile(profilePath) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
            rmSync(profilePath, { recursive: true, force: true, maxRetries: 1 });
            return;
        } catch (error) {
            if (attempt === 5 || error?.code !== 'EBUSY') {
                return;
            }
            await delay(500);
        }
    }
}

async function waitForFile(filePath, timeoutMs = RUNTIME_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (existsSync(filePath)) {
            return;
        }
        await delay(POLL_INTERVAL_MS);
    }
    throw new Error(`Browser did not create ${path.basename(filePath)} within ${timeoutMs / 1_000}s.`);
}

function readDevToolsPort(profilePath) {
    const lines = readFileSync(path.join(profilePath, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/);
    const port = Number.parseInt(lines[0] ?? '', 10);
    if (!Number.isInteger(port) || port < 1) {
        throw new Error('Browser reported an invalid DevTools port.');
    }
    return port;
}

async function getBrowserTarget(port, pageUrl) {
    const deadline = Date.now() + RUNTIME_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`);
        const targets = await response.json();
        const target = targets.find((candidate) => candidate.type === 'page' && candidate.url.startsWith(pageUrl));
        if (target?.webSocketDebuggerUrl) {
            return target;
        }
        await delay(POLL_INTERVAL_MS);
    }
    throw new Error(`Browser did not open ${pageUrl}.`);
}

function createCdpClient(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    const events = [];
    let nextId = 1;
    socket.on('message', (payload) => {
        const message = JSON.parse(payload.toString());
        if (message.id) {
            const request = pending.get(message.id);
            if (request) {
                pending.delete(message.id);
                if (message.error) {
                    request.reject(new Error(message.error.message));
                } else {
                    request.resolve(message.result);
                }
            }
            return;
        }
        events.push(message);
    });
    const open = new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
    });
    return {
        events,
        async send(method, params = {}) {
            await open;
            const id = nextId;
            nextId += 1;
            return new Promise((resolve, reject) => {
                pending.set(id, { resolve, reject });
                socket.send(JSON.stringify({ id, method, params }));
            });
        },
        async close() {
            for (const request of pending.values()) {
                request.reject(new Error('CDP connection closed.'));
            }
            pending.clear();
            socket.close();
        },
    };
}

function summarizeCdpArgument(argument) {
    return argument.value ?? argument.description ?? argument.type ?? 'unknown browser error';
}

export function collectCdpFailures(events) {
    const failures = [];
    for (const event of events) {
        if (event.method === 'Runtime.exceptionThrown') {
            const exception = event.params.exceptionDetails.exception;
            failures.push(`Uncaught browser exception: ${exception?.description ?? event.params.exceptionDetails.text}`);
        }
        if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
            const detail = event.params.args.map(summarizeCdpArgument).join(' ');
            failures.push(`Browser console error: ${detail}`);
        }
        if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
            failures.push(`Browser log error: ${event.params.entry.text}`);
        }
    }
    return unique(failures);
}

async function inspectPage(cdp) {
    const result = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
            const root = document.querySelector('#root');
            const bounds = root?.getBoundingClientRect();
            const text = root?.textContent?.trim() ?? '';
            return {
                rootVisible: Boolean(bounds && bounds.width > 0 && bounds.height > 0 && text),
                loadingVisible: Boolean(document.querySelector('[data-testid="app-loading"]')),
                viteOverlayVisible: Boolean(document.querySelector('vite-error-overlay')),
                startupFailureVisible: text.includes('${STARTUP_FAILURE_TEXT}'),
            };
        })()`,
        returnByValue: true,
    });
    return result.result.value;
}

async function waitForSmokeReady(cdp, timeoutMs = UI_READY_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    let state = { rootVisible: false, loadingVisible: false, viteOverlayVisible: false, startupFailureVisible: false };
    while (Date.now() < deadline) {
        state = await inspectPage(cdp);
        const failures = collectCdpFailures(cdp.events);
        if (isSmokeReadyState(state) || failures.length > 0 || state.startupFailureVisible || state.viteOverlayVisible) {
            return { state, failures };
        }
        await delay(POLL_INTERVAL_MS);
    }
    return { state, failures: collectCdpFailures(cdp.events) };
}

function writeFailureArtifacts({ cdp, error, output }) {
    const artifactDirectory = path.join(workspaceRoot, 'artifacts', 'ui-smoke', new Date().toISOString().replaceAll(':', '-'));
    mkdirSync(artifactDirectory, { recursive: true });
    writeFileSync(path.join(artifactDirectory, 'failure.txt'), `${error.message}\n\nRuntime output:\n${output.value}\n\nCDP events:\n${JSON.stringify(cdp?.events ?? [], null, 2)}\n`);
    if (!cdp) {
        return artifactDirectory;
    }
    return cdp.send('Page.captureScreenshot', { format: 'png' })
        .then((result) => {
            writeFileSync(path.join(artifactDirectory, 'failure.png'), Buffer.from(result.data, 'base64'));
            return artifactDirectory;
        })
        .catch(() => artifactDirectory);
}

function launchBrowser({ browser, pageUrl, profilePath }) {
    return spawn(browser, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-address=127.0.0.1',
        '--remote-debugging-port=0',
        `--user-data-dir=${profilePath}`,
        '--window-size=1280,900',
        pageUrl,
    ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: process.platform === 'win32',
    });
}

export async function runUiSmoke({ browser = resolveSmokeBrowser(), env = process.env } = {}) {
    if (!browser) {
        throw new Error('No supported browser found. Set UI_SMOKE_BROWSER to an Edge or Chrome executable.');
    }
    const ports = await reserveRuntimePorts();
    const runtime = startOwnedRuntime({ env, ...ports });
    const profilePath = mkdtempSync(path.join(os.tmpdir(), 'photostar-ui-smoke-'));
    const pageUrl = `http://127.0.0.1:${ports.webPort}`;
    let browserProcess;
    let cdp;
    try {
        await waitForPorts(ports);
        browserProcess = launchBrowser({ browser, pageUrl, profilePath });
        await waitForFile(path.join(profilePath, 'DevToolsActivePort'));
        const target = await getBrowserTarget(readDevToolsPort(profilePath), pageUrl);
        cdp = createCdpClient(target.webSocketDebuggerUrl);
        await Promise.all([cdp.send('Runtime.enable'), cdp.send('Log.enable'), cdp.send('Page.enable')]);
        const { state, failures } = await waitForSmokeReady(cdp);
        if (!isSmokeReadyState(state) || failures.length > 0) {
            throw new Error(getSmokeFailureReason(state, failures));
        }
        console.log(`UI smoke passed at ${pageUrl}.`);
    } catch (error) {
        const smokeError = error instanceof Error ? error : new Error(String(error));
        const artifactDirectory = await writeFailureArtifacts({ cdp, error: smokeError, output: runtime.output });
        smokeError.message = `${smokeError.message}\nArtifacts: ${artifactDirectory}`;
        throw smokeError;
    } finally {
        await cdp?.close();
        await stopOwnedProcessAndWait(browserProcess);
        await stopOwnedProcessAndWait(runtime.child);
        await removeTemporaryProfile(profilePath);
    }
}

function parseArgs(argv) {
    const parsed = { base: '', force: false, ifAffected: false };
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--force') {
            parsed.force = true;
        } else if (token === '--if-affected') {
            parsed.ifAffected = true;
        } else if (token === '--base') {
            parsed.base = argv[index + 1] ?? '';
            index += 1;
        } else if (token.startsWith('--base=')) {
            parsed.base = token.slice('--base='.length);
        }
    }
    return parsed;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const base = resolveUiSmokeBase({ explicitBase: args.base });
    const changedPaths = getChangedPathsSinceBase(base);
    if (args.ifAffected && !args.force && changedPaths && !shouldRunUiSmoke(changedPaths)) {
        console.log(`UI smoke skipped: no UI/runtime-affecting changes since ${base}.`);
        return;
    }
    if (args.ifAffected && !args.force && changedPaths === null) {
        console.log('UI smoke base could not be resolved; running conservatively.');
    }
    await runUiSmoke();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(`[ui-smoke] ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
