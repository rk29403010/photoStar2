#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveDevRuntimePorts } from './dev-runtime-config.js';
import { runCommandSync } from './process-invocation.js';
import {
    collectThreadSnapshot,
    readThreadRegistry,
    refreshThreadRegistry,
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

export function shouldStartManagedDevSessionInForeground({
    foreground = false,
    stdoutIsTTY = process.stdout.isTTY,
    forceForeground = false,
} = {}) {
    return foreground && (forceForeground || Boolean(stdoutIsTTY));
}

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

export function buildCombinedThreadNote({ existingNote, providedNote, sessionNote }) {
    const noteSegments = [];
    const pushUniqueNote = (value) => {
        if (typeof value !== 'string') {
            return;
        }

        const trimmedValue = value.trim();
        if (trimmedValue === '' || noteSegments.includes(trimmedValue)) {
            return;
        }

        noteSegments.push(trimmedValue);
    };

    pushUniqueNote(sessionNote);

    if (typeof providedNote === 'string' && providedNote.trim() !== '') {
        pushUniqueNote(providedNote);
        return noteSegments.join(' | ');
    }

    pushUniqueNote(existingNote);
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

function startManagedDevSession(script, options = {}) {
    const { cwd = process.cwd(), foreground = false, forceForeground = false } = options;
    runDevSessionCommand('pause', null, cwd);
    if (shouldStartManagedDevSessionInForeground({ foreground, forceForeground })) {
        return { mode: 'foreground' };
    }

    runDevSessionCommand('resume', script, cwd);
    return { mode: 'background' };
}

function stopManagedDevSession(cwd = process.cwd()) {
    runDevSessionCommand('pause', null, cwd);
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
    const registry = refreshThreadRegistry(readThreadRegistry(registryPath));
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

function clearCurrentThreadRuntime({ cwd = process.cwd() }) {
    const registryPath = resolveThreadRegistryPath(cwd);
    const registry = refreshThreadRegistry(readThreadRegistry(registryPath));
    const snapshot = collectThreadSnapshot(cwd);
    const existingEntry = findExistingThreadEntry(registry, snapshot.cwd);
    if (!existingEntry) {
        return {
            worktreeName: snapshot.worktreeName,
            task: getDefaultThreadTask(snapshot),
        };
    }

    upsertThreadEntry(registry, {
        ...existingEntry,
        ...snapshot,
        running: 'none',
        updatedAt: new Date().toISOString(),
    });
    writeThreadRegistry(registryPath, registry);

    return {
        worktreeName: snapshot.worktreeName,
        task: existingEntry.task,
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const command = typeof args._[0] === 'string' ? args._[0].trim() : 'start';
    if (command === 'stop') {
        stopManagedDevSession(process.cwd());
        const result = clearCurrentThreadRuntime({ cwd: process.cwd() });
        console.log(`Stopped managed dev session for ${result.worktreeName} as "${result.task}".`);
        return;
    }

    const script = ensureSupportedScript(
        typeof args.script === 'string' ? args.script.trim() : 'dev:desktop-runtime',
    );
    const foreground = args.foreground === true;
    const forceForeground = args['force-foreground'] === true;

    const startMode = startManagedDevSession(script, {
        cwd: process.cwd(),
        foreground,
        forceForeground,
    });
    const result = updateCurrentThreadEntry({
        task: typeof args.task === 'string' ? args.task : '',
        owner: typeof args.owner === 'string' ? args.owner : '',
        note: typeof args.note === 'string' ? args.note : '',
        script,
    });

    console.log(`Started ${script} for ${result.worktreeName} as "${result.task}".`);
    console.log(result.sessionNote);
    if (startMode.mode === 'foreground') {
        const runArgs = [
            path.join(workspaceRoot, 'tooling', 'scripts', 'repo', 'dev-session.js'),
            'run',
            script,
        ];
        const runResult = runCommandSync({
            command: nodeExecutable,
            args: runArgs,
            cwd: process.cwd(),
            stdio: 'inherit',
        });
        process.exit(runResult.status ?? 0);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
