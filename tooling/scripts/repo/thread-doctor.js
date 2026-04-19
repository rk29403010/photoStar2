#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveDevRuntimePorts } from './dev-runtime-config.js';
import { runCommandSync } from './process-invocation.js';
import { readThreadRegistry, refreshThreadRegistry, resolveThreadRegistryPath } from './thread-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const CLOSED_THREAD_STATUSES = new Set(['parked', 'merged', 'discarded']);

function isPidAlive(pid) {
    if (!pid) {
        return false;
    }

    try {
        process.kill(Number(pid), 0);
        return true;
    } catch {
        return false;
    }
}

function readManagedSessionRecord(worktreePath) {
    const sessionFilePath = path.join(worktreePath, '.local', 'dev-session.json');
    if (!existsSync(sessionFilePath)) {
        return null;
    }

    try {
        return JSON.parse(readFileSync(sessionFilePath, 'utf8'));
    } catch {
        return null;
    }
}

export function parseWindowsNetstatListeners(output) {
    const listenerMap = new Map();
    const lines = String(output ?? '').split(/\r?\n/);

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!/\sLISTENING\s/i.test(trimmedLine)) {
            continue;
        }

        const parts = trimmedLine.split(/\s+/);
        const localAddress = parts[1] ?? '';
        const pid = Number.parseInt(parts[parts.length - 1] ?? '', 10);
        const portText = localAddress.split(':').at(-1) ?? '';
        const port = Number.parseInt(portText, 10);
        if (!Number.isInteger(port) || !Number.isInteger(pid)) {
            continue;
        }

        listenerMap.set(port, pid);
    }

    return listenerMap;
}

function getListeningProcessMap(ports) {
    if (ports.length === 0 || process.platform !== 'win32') {
        return new Map();
    }

    const result = runCommandSync({
        command: 'netstat.exe',
        args: ['-ano', '-p', 'tcp'],
        cwd: workspaceRoot,
        encoding: 'utf8',
    });
    if ((result.status ?? 1) !== 0) {
        return new Map();
    }

    const allListeners = parseWindowsNetstatListeners(result.stdout ?? '');
    return new Map(ports
        .map((port) => [port, allListeners.get(port) ?? null])
        .filter(([, pid]) => pid !== null));
}

export function buildThreadDoctorRow({
    entry,
    webPort,
    backendPort,
    sessionPid,
    sessionRunning,
    listenerMap,
}) {
    return {
        task: entry.task,
        status: entry.status,
        worktreeName: entry.worktreeName,
        running: entry.running,
        url: `http://localhost:${webPort}`,
        backendPort,
        trackedPid: sessionPid ?? null,
        trackedState: sessionPid ? (sessionRunning ? 'live' : 'stale') : 'none',
        webPid: listenerMap.get(webPort) ?? null,
        backendPid: listenerMap.get(backendPort) ?? null,
    };
}

export function buildUntrackedListenerRows({ listenerMap, trackedPorts }) {
    return [...listenerMap.entries()]
        .filter(([port]) => !trackedPorts.has(port))
        .sort((left, right) => left[0] - right[0])
        .map(([port, pid]) => ({ port, pid }));
}

function renderThreadDoctorReport(rows, untrackedRows = []) {
    if (rows.length === 0 && untrackedRows.length === 0) {
        return 'No open threads to inspect.';
    }

    const sections = [];

    if (rows.length > 0) {
        sections.push(rows
        .map((row) => {
            const trackedLabel = row.trackedPid ? `${row.trackedPid} ${row.trackedState}` : 'none';
            const webPidLabel = row.webPid ?? 'none';
            const backendPidLabel = row.backendPid ?? 'none';
            return `${row.status} | ${row.task} | ${row.worktreeName} | running:${row.running} | url:${row.url} | backend:${row.backendPort} | tracked:${trackedLabel} | web:${webPidLabel} | backend-pid:${backendPidLabel}`;
        })
        .join('\n'));
    }

    if (untrackedRows.length > 0) {
        sections.push([
            'Untracked listeners:',
            ...untrackedRows.map((row) => `port:${row.port} | pid:${row.pid}`),
        ].join('\n'));
    }

    return sections.join('\n\n');
}

function main() {
    const registryPath = resolveThreadRegistryPath(process.cwd());
    const registry = refreshThreadRegistry(readThreadRegistry(registryPath));
    const openEntries = registry.entries.filter((entry) => !CLOSED_THREAD_STATUSES.has(entry.status));
    const trackedPorts = new Set(openEntries.flatMap((entry) => {
        const { webPort, backendPort } = resolveDevRuntimePorts(process.env, entry.worktreePath ?? entry.cwd);
        return [webPort, backendPort];
    }));
    const listenerMap = getListeningProcessMap([...trackedPorts, 5173, 5174]);

    const rows = openEntries.map((entry) => {
        const { webPort, backendPort } = resolveDevRuntimePorts(process.env, entry.worktreePath ?? entry.cwd);
        const session = readManagedSessionRecord(entry.worktreePath ?? entry.cwd);
        return buildThreadDoctorRow({
            entry,
            webPort,
            backendPort,
            sessionPid: session?.pid ?? null,
            sessionRunning: isPidAlive(session?.pid),
            listenerMap,
        });
    });
    const untrackedRows = buildUntrackedListenerRows({
        listenerMap,
        trackedPorts,
    });

    console.log(renderThreadDoctorReport(rows, untrackedRows));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
