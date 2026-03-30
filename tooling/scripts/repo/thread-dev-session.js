#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveDevRuntimePorts } from './dev-runtime-config.js';
import { runCommandSync } from './process-invocation.js';
import {
    collectThreadSnapshot,
    readThreadRegistry,
    resolveThreadRegistryPath,
    upsertThreadEntry,
    writeThreadRegistry,
} from './thread-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const nodeExecutable = process.execPath;
const SUPPORTED_MANAGED_SCRIPTS = new Set([
    'dev',
    'dev:desktop-runtime',
    'dev:desktop-runtime:debug',
]);

function parseArgs(argv) {
    const parsed = { _: [] };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
            parsed._.push(token);
            continue;
        }

        const key = token.slice(2);
        const nextToken = argv[index + 1];
        if (!nextToken || nextToken.startsWith('--')) {
            parsed[key] = true;
            continue;
        }

        parsed[key] = nextToken;
        index += 1;
    }

    return parsed;
}

export function getDefaultThreadTask({ branch, worktreeName }) {
    return worktreeName && worktreeName !== 'main' ? worktreeName : branch;
}

export function buildThreadDevSessionNote({ script, webPort, backendPort }) {
    return `${script} @ http://localhost:${webPort} (backend ${backendPort})`;
}

function buildCombinedThreadNote({ existingNote, providedNote, sessionNote }) {
    const noteSegments = [sessionNote];

    if (typeof providedNote === 'string' && providedNote.trim() !== '') {
        noteSegments.push(providedNote.trim());
        return noteSegments.join(' | ');
    }

    if (typeof existingNote === 'string' && existingNote.trim() !== '') {
        noteSegments.push(existingNote.trim());
    }

    return noteSegments.join(' | ');
}

function normalizeOptionalString(value) {
    return typeof value === 'string' && value.trim() !== ''
        ? value.trim()
        : '';
}

function ensureSupportedScript(script) {
    if (!SUPPORTED_MANAGED_SCRIPTS.has(script)) {
        throw new Error(`Unsupported managed dev script: ${script}`);
    }

    return script;
}

function runDevSessionCommand(command, script, cwd = process.cwd()) {
    const args = [
        path.join(workspaceRoot, 'tooling', 'scripts', 'repo', 'dev-session.js'),
        command,
    ];
    if (script) {
        args.push(script);
    }

    const result = runCommandSync({
        command: nodeExecutable,
        args,
        cwd,
        encoding: 'utf8',
    });

    if ((result.status ?? 1) !== 0) {
        const stderr = result.stderr?.trim();
        throw new Error(stderr || `Unable to ${command} managed dev session.`);
    }
}

function startManagedDevSession(script, cwd = process.cwd()) {
    runDevSessionCommand('pause', null, cwd);
    runDevSessionCommand('resume', script, cwd);
}

function findExistingThreadEntry(registry, cwd) {
    const normalizedCwd = path.resolve(cwd);
    return registry.entries.find((candidate) => path.resolve(candidate.cwd) === normalizedCwd);
}

function resolveThreadTask(task, existingEntry, snapshot) {
    return normalizeOptionalString(task)
        || existingEntry?.task
        || getDefaultThreadTask(snapshot);
}

function resolveThreadOwner(owner, existingEntry) {
    return normalizeOptionalString(owner) || existingEntry?.owner || '';
}

function buildThreadUpdate({
    snapshot,
    existingEntry,
    task,
    owner,
    note,
    script,
    sessionNote,
    timestamp,
}) {
    return {
        ...snapshot,
        ...existingEntry,
        task,
        status: 'active',
        owner,
        note: buildCombinedThreadNote({
            existingNote: existingEntry?.note,
            providedNote: note,
            sessionNote,
        }),
        running: script,
        updatedAt: timestamp,
    };
}

function updateCurrentThreadEntry({ task, owner, note, script, cwd = process.cwd(), env = process.env }) {
    const registryPath = resolveThreadRegistryPath(cwd);
    const registry = readThreadRegistry(registryPath);
    const snapshot = collectThreadSnapshot(cwd);
    const existingEntry = findExistingThreadEntry(registry, snapshot.cwd);
    const { webPort, backendPort } = resolveDevRuntimePorts(env, snapshot.worktreePath);
    const sessionNote = buildThreadDevSessionNote({
        script,
        webPort,
        backendPort,
    });
    const timestamp = new Date().toISOString();
    const resolvedTask = resolveThreadTask(task, existingEntry, snapshot);
    const resolvedOwner = resolveThreadOwner(owner, existingEntry);

    upsertThreadEntry(registry, buildThreadUpdate({
        snapshot,
        existingEntry,
        task: resolvedTask,
        owner: resolvedOwner,
        note,
        script,
        sessionNote,
        timestamp,
    }));
    writeThreadRegistry(registryPath, registry);

    return {
        worktreeName: snapshot.worktreeName,
        task: resolvedTask,
        sessionNote,
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const script = ensureSupportedScript(
        typeof args.script === 'string' ? args.script.trim() : 'dev:desktop-runtime',
    );

    startManagedDevSession(script, process.cwd());
    const result = updateCurrentThreadEntry({
        task: typeof args.task === 'string' ? args.task : '',
        owner: typeof args.owner === 'string' ? args.owner : '',
        note: typeof args.note === 'string' ? args.note : '',
        script,
    });

    console.log(`Started ${script} for ${result.worktreeName} as "${result.task}".`);
    console.log(result.sessionNote);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
