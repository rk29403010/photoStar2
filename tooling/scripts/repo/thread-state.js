#!/usr/bin/env node
import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveDevRuntimePorts } from './dev-runtime-config.js';
import { runCommandSync } from './process-invocation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';
const VALID_STATUSES = new Set([
    'active',
    'blocked',
    'ready-to-merge',
    'cleanup-pending',
    'parked',
    'merged',
    'discarded',
]);
const CLOSED_STATUSES = new Set(['parked', 'merged', 'discarded']);

export function createEmptyThreadRegistry() {
    return {
        version: 1,
        entries: [],
    };
}

function normalizeRegistry(registry) {
    const targetRegistry = registry && typeof registry === 'object'
        ? registry
        : createEmptyThreadRegistry();
    targetRegistry.version = 1;
    if (!Array.isArray(targetRegistry.entries)) {
        targetRegistry.entries = [];
    }

    return targetRegistry;
}

function normalizePathForKey(targetPath) {
    return path.resolve(targetPath).replaceAll('\\', '/').toLowerCase();
}

function normalizeThreadNote(note) {
    if (typeof note !== 'string' || note.trim() === '') {
        return '';
    }

    const segments = note
        .split(' | ')
        .map((segment) => segment.trim())
        .filter(Boolean);

    return [...new Set(segments)].join(' | ');
}

export function getWorktreeNameFromPath(targetPath) {
    const normalized = path.resolve(targetPath).replaceAll('\\', '/');
    const match = normalized.match(/(?:^|\/)(?:\.worktrees|worktrees)\/([^/]+)/i);
    return match?.[1] ?? 'main';
}

function ensureValidStatus(status) {
    if (!VALID_STATUSES.has(status)) {
        throw new Error(`Unsupported thread status: ${status}`);
    }
}

function isClosedStatus(status) {
    return CLOSED_STATUSES.has(status);
}

function sortEntries(entries) {
    return [...entries].sort((left, right) => {
        const leftClosed = isClosedStatus(left.status);
        const rightClosed = isClosedStatus(right.status);
        if (leftClosed !== rightClosed) {
            return leftClosed ? 1 : -1;
        }

        return left.task.localeCompare(right.task);
    });
}

function getThreadAppLabel(entry, runningLabel) {
    if (runningLabel === 'none') {
        return 'none';
    }

    if (typeof entry.appUrl === 'string' && entry.appUrl.trim() !== '') {
        return entry.appUrl;
    }

    if (Number.isInteger(entry.webPort)) {
        return `http://localhost:${entry.webPort}`;
    }

    return 'unknown';
}

export function upsertThreadEntry(registry, entry) {
    const nextRegistry = normalizeRegistry(registry);
    ensureValidStatus(entry.status);

    const entryKey = normalizePathForKey(entry.cwd);
    const existingIndex = nextRegistry.entries.findIndex((candidate) => normalizePathForKey(candidate.cwd) === entryKey);
    const existingEntry = existingIndex >= 0 ? nextRegistry.entries[existingIndex] : null;
    const nextEntry = {
        ...existingEntry,
        ...entry,
        note: normalizeThreadNote(entry.note ?? existingEntry?.note ?? ''),
        createdAt: existingEntry?.createdAt ?? entry.updatedAt,
    };

    if (!isClosedStatus(nextEntry.status)) {
        delete nextEntry.closedAt;
    }

    if (existingIndex >= 0) {
        nextRegistry.entries.splice(existingIndex, 1, nextEntry);
        return nextEntry;
    }

    nextRegistry.entries.push(nextEntry);
    return nextEntry;
}

export function closeThreadEntry(registry, cwd, status, timestamp = new Date().toISOString()) {
    ensureValidStatus(status);

    const nextRegistry = normalizeRegistry(registry);
    const entryKey = normalizePathForKey(cwd);
    const existingEntry = nextRegistry.entries.find((candidate) => normalizePathForKey(candidate.cwd) === entryKey);
    if (!existingEntry) {
        throw new Error(`No registered thread for ${cwd}`);
    }

    existingEntry.status = status;
    existingEntry.running = 'none';
    existingEntry.updatedAt = timestamp;
    existingEntry.closedAt = timestamp;
    return existingEntry;
}

export function findThreadEntry(registry, options = {}) {
    const nextRegistry = normalizeRegistry(registry);
    const task = typeof options.task === 'string' ? options.task.trim().toLowerCase() : '';
    const branch = typeof options.branch === 'string' ? options.branch.trim() : '';
    const cwd = typeof options.cwd === 'string' ? options.cwd.trim() : '';
    const worktreeName = typeof options.worktreeName === 'string' ? options.worktreeName.trim().toLowerCase() : '';

    if (cwd) {
        const entryKey = normalizePathForKey(cwd);
        return nextRegistry.entries.find((candidate) => normalizePathForKey(candidate.cwd) === entryKey) ?? null;
    }

    if (branch) {
        return nextRegistry.entries.find((candidate) => candidate.branch === branch) ?? null;
    }

    if (task) {
        return nextRegistry.entries.find((candidate) => candidate.task.trim().toLowerCase() === task) ?? null;
    }

    if (worktreeName) {
        return nextRegistry.entries.find((candidate) => candidate.worktreeName.trim().toLowerCase() === worktreeName) ?? null;
    }

    return null;
}

export function renderThreadList(registry) {
    const nextRegistry = normalizeRegistry(registry);
    if (nextRegistry.entries.length === 0) {
        return 'No registered threads.';
    }

    return sortEntries(nextRegistry.entries)
        .map((entry) => {
            const dirtyLabel = entry.dirty ? `dirty:${entry.dirtyCount}` : 'clean';
            const runningLabel = entry.running && entry.running !== 'none' ? entry.running : 'none';
            const appLabel = getThreadAppLabel(entry, runningLabel);
            const backendLabel = Number.isInteger(entry.backendPort) ? String(entry.backendPort) : 'unknown';
            const pathLabel = entry.worktreePath ?? entry.cwd;
            const ownerLabel = entry.owner ? ` | owner:${entry.owner}` : '';
            const noteLabel = entry.note ? ` | note:${normalizeThreadNote(entry.note)}` : '';
            const branchLabel = entry.branch || '(detached)';
            const divergenceLabel = Number.isInteger(entry.ahead) && Number.isInteger(entry.behind)
                ? ` | base:${entry.baseRef ?? 'main'} | ahead:${entry.ahead} | behind:${entry.behind}`
                : '';
            const integrationLabel = entry.includedInMain ? ' | included-in-main:yes' : ' | included-in-main:no';
            const staleLabel = entry.missing ? ` | stale:${entry.staleReason || 'worktree-missing'}` : '';
            return `${entry.status} | ${entry.task} | ${branchLabel} | ${entry.worktreeName} | ${dirtyLabel} | running:${runningLabel} | app:${appLabel} | backend:${backendLabel} | path:${pathLabel} | commit:${entry.lastCommit}${divergenceLabel}${integrationLabel}${staleLabel}${ownerLabel}${noteLabel}`;
        })
        .join('\n');
}

export function resolveThreadRegistryPath(cwd = workspaceRoot) {
    const result = runCommandSync({
        command: gitExecutable,
        args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        cwd,
        encoding: 'utf8',
    });

    if ((result.status ?? 1) !== 0) {
        throw new Error('Unable to resolve shared git directory for thread registry.');
    }

    return path.join(result.stdout.trim(), 'codex-thread-state.json');
}

export function readThreadRegistry(registryPath) {
    if (!existsSync(registryPath)) {
        return createEmptyThreadRegistry();
    }

    try {
        return normalizeRegistry(JSON.parse(readFileSync(registryPath, 'utf8')));
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Task registry is corrupt at ${registryPath}. Refusing to overwrite it: ${detail}`);
    }
}

export function writeThreadRegistry(registryPath, registry) {
    mkdirSync(path.dirname(registryPath), { recursive: true });
    const lockPath = `${registryPath}.lock`;
    let lockHandle;
    try {
        lockHandle = openSync(lockPath, 'wx');
    } catch {
        throw new Error(`Task registry is locked by another writer: ${lockPath}. Retry the command.`);
    }

    const temporaryPath = `${registryPath}.${process.pid}.tmp`;
    try {
        writeFileSync(temporaryPath, `${JSON.stringify(normalizeRegistry(registry), null, 2)}\n`);
        renameSync(temporaryPath, registryPath);
    } finally {
        if (lockHandle !== undefined) {
            closeSync(lockHandle);
        }
        rmSync(temporaryPath, { force: true });
        rmSync(lockPath, { force: true });
    }
}

export function refreshThreadRegistry(registry, collectSnapshot = collectThreadSnapshot) {
    const nextRegistry = normalizeRegistry(registry);
    const nextEntries = nextRegistry.entries.map((entry) => {
        try {
            const snapshot = collectSnapshot(entry.cwd);
            return {
                ...entry,
                ...snapshot,
                note: normalizeThreadNote(entry.note),
            };
        } catch {
            const containmentRef = entry.head || entry.lastCommit || entry.branch;
            const includedInMain = containmentRef
                ? isBranchMergedIntoTargets({ branch: containmentRef, cwd: workspaceRoot })
                : false;
            return {
                ...entry,
                note: normalizeThreadNote(entry.note),
                running: 'none',
                missing: true,
                residualPathExists: existsSync(entry.cwd),
                staleReason: 'worktree-missing',
                includedInMain,
            };
        }
    });

    return {
        ...nextRegistry,
        entries: nextEntries,
    };
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

function isPidAlive(pid) {
    try {
        process.kill(Number(pid), 0);
        return true;
    } catch {
        return false;
    }
}

export function getManagedSessionState(session, isAlive = isPidAlive) {
    if (!session?.pid || !isAlive(session.pid)) {
        return 'none';
    }

    return session.lastScript ?? 'managed-dev-session';
}

function readManagedDevSession(worktreePath) {
    const sessionFilePath = path.join(worktreePath, '.local', 'dev-session.json');
    if (!existsSync(sessionFilePath)) {
        return 'none';
    }

    try {
        const session = JSON.parse(readFileSync(sessionFilePath, 'utf8'));
        return getManagedSessionState(session);
    } catch {
        return 'none';
    }
}

function runGit(args, cwd) {
    return runCommandSync({
        command: gitExecutable,
        args,
        cwd,
        encoding: 'utf8',
    });
}

function runGitText(args, cwd) {
    const result = runGit(args, cwd);

    if ((result.status ?? 1) !== 0) {
        throw new Error(`Git command failed: ${args.join(' ')}`);
    }

    return result.stdout.trim();
}

export function isBranchMergedIntoTargets(
    { branch, cwd = workspaceRoot, targets = ['main', 'origin/main'] },
    executeGit = runGit,
) {
    if (typeof branch !== 'string' || branch.trim() === '') {
        return false;
    }

    return targets.some((target) => {
        const targetRefResult = executeGit(['rev-parse', '--verify', target], cwd);
        if ((targetRefResult.status ?? 1) !== 0) {
            return false;
        }

        const mergeCheckResult = executeGit(['merge-base', '--is-ancestor', branch, target], cwd);
        return (mergeCheckResult.status ?? 1) === 0;
    });
}

export function collectThreadSnapshot(cwd = workspaceRoot) {
    if (!existsSync(path.join(cwd, '.git'))) {
        throw new Error(`Task worktree is missing its Git metadata: ${cwd}`);
    }
    const worktreePath = runGitText(['rev-parse', '--show-toplevel'], cwd);
    const branch = runGitText(['branch', '--show-current'], cwd);
    const head = runGitText(['rev-parse', 'HEAD'], cwd);
    const lastCommit = head.slice(0, 7);
    const gitStatus = runGitText(['status', '--short'], cwd);
    const dirtyCount = gitStatus === '' ? 0 : gitStatus.split(/\r?\n/).filter(Boolean).length;
    const { webPort, backendPort } = resolveDevRuntimePorts(process.env, worktreePath);
    const divergenceText = runGitText(['rev-list', '--left-right', '--count', 'main...HEAD'], cwd);
    const [behind = 0, ahead = 0] = divergenceText.split(/\s+/).map(Number);
    const includedInMain = (runGit(['merge-base', '--is-ancestor', 'HEAD', 'main'], cwd).status ?? 1) === 0;

    return {
        cwd: worktreePath,
        branch,
        detached: branch === '',
        head,
        baseRef: 'main',
        ahead,
        behind,
        includedInMain,
        missing: false,
        staleReason: '',
        lastCommit,
        dirty: dirtyCount > 0,
        dirtyCount,
        running: readManagedDevSession(worktreePath),
        appUrl: `http://localhost:${webPort}`,
        webPort,
        backendPort,
        worktreeName: getWorktreeNameFromPath(worktreePath),
        worktreePath,
    };
}

function requireStringArg(args, key, helpText) {
    const value = args[key];
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(helpText);
    }

    return value.trim();
}

function handleRegister(args, registryPath) {
    const task = requireStringArg(args, 'task', 'Usage: thread:register -- --task "<task>" [--owner "<thread>"] [--note "<note>"]');
    const status = typeof args.status === 'string' ? args.status.trim() : 'active';
    ensureValidStatus(status);

    const registry = readThreadRegistry(registryPath);
    const snapshot = collectThreadSnapshot(process.cwd());
    const timestamp = new Date().toISOString();

    upsertThreadEntry(registry, {
        ...snapshot,
        task,
        status,
        owner: typeof args.owner === 'string'
            ? args.owner.trim()
            : process.env.CODEX_THREAD_ID ?? process.env.ANTIGRAVITY_SESSION_ID ?? process.env.AI_AGENT_OWNER ?? '',
        note: typeof args.note === 'string' ? args.note.trim() : '',
        updatedAt: timestamp,
    });
    writeThreadRegistry(registryPath, registry);

    console.log(`Registered ${snapshot.worktreeName} as "${task}" (${status}).`);
}

function handleUpdate(args, registryPath) {
    const registry = readThreadRegistry(registryPath);
    const snapshot = collectThreadSnapshot(process.cwd());
    const entryKey = normalizePathForKey(snapshot.worktreePath);
    const existingEntry = registry.entries.find((candidate) => normalizePathForKey(candidate.cwd) === entryKey);
    if (!existingEntry) {
        throw new Error('No registered thread found for this worktree. Run thread:register first.');
    }

    const status = typeof args.status === 'string' ? args.status.trim() : existingEntry.status;
    ensureValidStatus(status);

    upsertThreadEntry(registry, {
        ...existingEntry,
        ...snapshot,
        task: typeof args.task === 'string' ? args.task.trim() : existingEntry.task,
        status,
        owner: typeof args.owner === 'string' ? args.owner.trim() : existingEntry.owner,
        note: typeof args.note === 'string' ? args.note.trim() : existingEntry.note,
        running: typeof args.running === 'string' ? args.running.trim() : snapshot.running,
        updatedAt: new Date().toISOString(),
    });
    writeThreadRegistry(registryPath, registry);

    console.log(`Updated ${snapshot.worktreeName} to ${status}.`);
}

function handleClose(args, registryPath) {
    const status = typeof args.status === 'string' ? args.status.trim() : 'parked';
    ensureValidStatus(status);

    const registry = readThreadRegistry(registryPath);
    const snapshot = collectThreadSnapshot(process.cwd());
    const targetEntry = findThreadEntry(registry, {
        cwd: typeof args.cwd === 'string' ? args.cwd : '',
        branch: typeof args.branch === 'string' ? args.branch : '',
        task: typeof args.task === 'string' ? args.task : '',
        worktreeName: typeof args.worktree === 'string' ? args.worktree : '',
    });
    const existingEntry = targetEntry
        ?? registry.entries.find((candidate) => normalizePathForKey(candidate.cwd) === normalizePathForKey(snapshot.worktreePath));
    if (!existingEntry) {
        throw new Error('No registered thread found for this worktree. Run thread:register first.');
    }

    const containmentRefs = [existingEntry.branch, existingEntry.head].filter(Boolean);
    const isContained = containmentRefs.some((branch) => isBranchMergedIntoTargets({
        branch,
        cwd: process.cwd(),
    }));
    if (status === 'merged' && !isContained) {
        throw new Error(
            `Cannot close ${existingEntry.worktreeName} as merged because neither its branch nor recorded head is contained in main or origin/main.`,
        );
    }

    const timestamp = new Date().toISOString();
    const nextEntry = normalizePathForKey(existingEntry.cwd) === normalizePathForKey(snapshot.worktreePath)
        ? { ...existingEntry, ...snapshot }
        : { ...existingEntry };
    upsertThreadEntry(registry, {
        ...nextEntry,
        status,
        note: typeof args.note === 'string' ? args.note.trim() : existingEntry.note,
        running: 'none',
        updatedAt: timestamp,
    });
    closeThreadEntry(registry, existingEntry.cwd, status, timestamp);
    writeThreadRegistry(registryPath, registry);

    console.log(`Closed ${existingEntry.worktreeName} as ${status}.`);
}

function handleStatus(registryPath) {
    const registry = refreshThreadRegistry(readThreadRegistry(registryPath));
    const snapshot = collectThreadSnapshot(process.cwd());
    const entry = registry.entries.find((candidate) => normalizePathForKey(candidate.cwd) === normalizePathForKey(snapshot.worktreePath));
    if (!entry) {
        console.log(renderThreadList({
            version: 1,
            entries: [{
                ...snapshot,
                task: 'unregistered',
                status: 'active',
                owner: '',
                note: 'Run thread:register to track this worktree.',
                updatedAt: new Date().toISOString(),
            }],
        }));
        return;
    }

    console.log(renderThreadList({
        version: 1,
        entries: [{
            ...entry,
            ...snapshot,
        }],
    }));
}

function handleList(registryPath) {
    const registry = refreshThreadRegistry(readThreadRegistry(registryPath));
    const worktreeOutput = runGitText(['worktree', 'list', '--porcelain'], process.cwd());
    const attachedPaths = worktreeOutput
        .split(/\r?\n/)
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.slice('worktree '.length));
    for (const worktreePath of attachedPaths) {
        if (findThreadEntry(registry, { cwd: worktreePath })) {
            continue;
        }
        try {
            const snapshot = collectThreadSnapshot(worktreePath);
            upsertThreadEntry(registry, {
                ...snapshot,
                task: 'unregistered',
                status: 'active',
                owner: '',
                note: 'Attached Git worktree is not registered.',
                updatedAt: new Date().toISOString(),
            });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            console.warn(`[task-audit] Unable to inspect attached worktree ${worktreePath}: ${detail}`);
        }
    }
    console.log(renderThreadList(registry));
}

export function buildReconciliationPlan(registry) {
    return normalizeRegistry(registry).entries
        .filter((entry) => {
            const unfinishedResidue = !isClosedStatus(entry.status)
                && (entry.missing || entry.status === 'cleanup-pending');
            const mergedWorktreeResidue = entry.status === 'merged'
                && (!entry.missing || entry.residualPathExists === true);
            return unfinishedResidue || mergedWorktreeResidue;
        })
        .map((entry) => {
            const noWorktreeContentRemains = entry.missing === true;
            const cleanupIsProven = entry.includedInMain
                && (!entry.dirty || noWorktreeContentRemains);
            let reason = 'cleanup is unsafe because merge containment or cleanliness is unproven';
            if (cleanupIsProven) {
                reason = noWorktreeContentRemains
                    ? 'merge is proven and no worktree content remains'
                    : 'merge is proven and the task is clean';
            }
            return {
                action: cleanupIsProven ? 'cleanup-merged-residue' : 'keep',
                branch: entry.branch,
                cwd: entry.cwd,
                task: entry.task,
                reason,
            };
        });
}

function removeReconciledWorktree(item) {
    if (existsSync(item.cwd)) {
        if (existsSync(path.join(item.cwd, '.git'))) {
            const removeResult = runGit(['worktree', 'remove', item.cwd], process.cwd());
            if ((removeResult.status ?? 1) !== 0) {
                throw new Error(`Unable to remove merged worktree ${item.cwd}. Resolve its Git worktree state and retry.`);
            }
        } else {
            const normalizedPath = normalizePathForKey(path.resolve(item.cwd));
            const isRecognizedTaskPath = /(?:^|\/)(?:\.worktrees|worktrees)\//u.test(normalizedPath);
            if (!isRecognizedTaskPath) {
                throw new Error(`Refusing to remove unrecognized residual task directory: ${item.cwd}`);
            }
            rmSync(item.cwd, { recursive: true, force: true });
        }
    }
}

function removeReconciledBranch(item) {
    if (item.branch) {
        const branchResult = runGit(['branch', '-d', item.branch], process.cwd());
        if ((branchResult.status ?? 1) !== 0) {
            const verifyResult = runGit(['show-ref', '--verify', '--quiet', `refs/heads/${item.branch}`], process.cwd());
            if ((verifyResult.status ?? 1) === 0) {
                throw new Error(`Unable to delete merged local branch ${item.branch}. The registry remains cleanup-pending.`);
            }
        }
    }
}

function applyReconciliationItem(registry, item) {
    const currentPath = runGitText(['rev-parse', '--show-toplevel'], process.cwd());
    if (normalizePathForKey(item.cwd) === normalizePathForKey(currentPath)) {
        throw new Error(`Refusing to remove the current worktree (${item.cwd}). Run reconciliation from main.`);
    }
    removeReconciledWorktree(item);
    removeReconciledBranch(item);
    closeThreadEntry(registry, item.cwd, 'merged');
}

function handleReconcile(args, registryPath) {
    const registry = refreshThreadRegistry(readThreadRegistry(registryPath));
    const plan = buildReconciliationPlan(registry);
    if (plan.length === 0) {
        console.log('No stale task records found.');
        return;
    }

    for (const item of plan) {
        console.log(`${item.action} | ${item.task} | ${item.cwd} | ${item.reason}`);
        if (args.apply === true && item.action === 'cleanup-merged-residue') {
            applyReconciliationItem(registry, item);
        }
    }
    if (args.apply === true) {
        writeThreadRegistry(registryPath, registry);
        console.log('Applied verified cleanup of merged task residues. Unproven or dirty tasks were left intact.');
    } else {
        console.log('Dry run only. Re-run from main with --apply to remove only clean, proven-merged residues.');
    }
}

function main() {
    const [command, ...rest] = process.argv.slice(2);
    const args = parseArgs(rest);
    const registryPath = resolveThreadRegistryPath(process.cwd());

    if (command === 'register') {
        handleRegister(args, registryPath);
        return;
    }

    if (command === 'update') {
        handleUpdate(args, registryPath);
        return;
    }

    if (command === 'close') {
        handleClose(args, registryPath);
        return;
    }

    if (command === 'status') {
        handleStatus(registryPath);
        return;
    }

    if (command === 'list' || command === 'audit') {
        handleList(registryPath);
        return;
    }


    if (command === 'reconcile') {
        handleReconcile(args, registryPath);
        return;
    }

    console.error('Usage: node tooling/scripts/repo/thread-state.js <register|update|close|status|list|audit|reconcile> [--task "<task>"] [--status "<status>"] [--owner "<owner>"] [--note "<note>"] [--apply]');
    process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
