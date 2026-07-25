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
const ghExecutable = process.platform === 'win32' ? 'gh.exe' : 'gh';
const VALID_STATUSES = new Set([
    'active',
    'blocked',
    'ready-to-merge',
    'published',
    'merge-queued',
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

function matchesEntryFilters(entry, filters = {}) {
    return entryMatchesFilter(entry.status, filters.status)
        && entryMatchesFilter(entry.task, filters.task)
        && entryMatchesFilter(entry.branch, filters.branch)
        && entryMatchesFilter(entry.cwd, filters.worktree);
}

function entryMatchesFilter(value, filter) {
    return !filter || String(value ?? '').toLowerCase().includes(filter.toLowerCase());
}

function getPublicationLabel(entry) {
    if (entry.prNumber) {
        return `#${entry.prNumber} ${entry.status}`;
    }
    return entry.status === 'published' || entry.status === 'merge-queued' ? entry.status : '-';
}

export function classifyOverlap({ left, right, leftPaths, rightPaths }) {
    const sharedPaths = [...new Set(leftPaths.filter((filePath) => rightPaths.includes(filePath)))].sort();
    const generatedOnly = sharedPaths.length > 0 && sharedPaths.every((filePath) => /(?:^|\/)(?:dist|artifacts|generated|registry)\//u.test(filePath) || /\.generated\./u.test(filePath));
    const sharedArchitectureHotspots = sharedPaths.filter((filePath) => /(?:registry|contract|host|index\.(?:ts|js)|package\.json|docs\/ai)/u.test(filePath));
    const sameIntegrationParent = Boolean(left.integrationTaskId) && left.integrationTaskId === right.integrationTaskId;
    let action = 'block';
    if (sharedPaths.length === 0) {action = 'continue';}
    else if (sameIntegrationParent) {action = 'coordinate through integration';}
    return { left: left.task, right: right.task, sharedPaths, sharedArchitectureHotspots, generatedOnly, sameIntegrationParent, recommendedAction: action };
}

function changedPathsForEntry(entry) {
    const base = entry.intendedBaseBranch || entry.baseRef || 'main';
    const result = runGit(['diff', '--name-only', `${base}...${entry.branch}`], process.cwd());
    return (result.status ?? 1) === 0 ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
}

function handleOverlap(args, registryPath) {
    const registry = refreshThreadRegistry(readThreadRegistry(registryPath));
    const entries = registry.entries.filter((entry) => !isClosedStatus(entry.status) && entry.task !== 'unregistered');
    const reports = [];
    for (let index = 0; index < entries.length; index += 1) {
        for (let nextIndex = index + 1; nextIndex < entries.length; nextIndex += 1) {
            reports.push(classifyOverlap({ left: entries[index], right: entries[nextIndex], leftPaths: changedPathsForEntry(entries[index]), rightPaths: changedPathsForEntry(entries[nextIndex]) }));
        }
    }
    if (args.json === true) {console.log(JSON.stringify(reports, null, 2)); return;}
    if (reports.length === 0) {console.log('No active task pairs to compare.'); return;}
    console.log(formatTable(reports.map((report) => [report.left, report.right, report.sharedPaths.join(', ') || '-', report.sharedArchitectureHotspots.join(', ') || '-', report.generatedOnly ? 'yes' : 'no', report.sameIntegrationParent ? 'yes' : 'no', report.recommendedAction]), ['LEFT', 'RIGHT', 'OVERLAPPING PATHS', 'HOTSPOTS', 'GENERATED ONLY', 'SAME INTEGRATION', 'ACTION']));
}

function formatTable(rows, columns) {
    const widths = columns.map((column, index) => Math.max(column.length, ...rows.map((row) => String(row[index] ?? '').length)));
    const formatRow = (row) => row.map((cell, index) => String(cell ?? '').padEnd(widths[index])).join('  ');
    return [formatRow(columns), formatRow(columns.map((column, index) => '-'.repeat(widths[index]))), ...rows.map(formatRow)].join('\n');
}

export function renderThreadList(registry, options = {}) {
    const nextRegistry = normalizeRegistry(registry);
    const entries = sortEntries(nextRegistry.entries)
        .filter((entry) => options.all === true || !isClosedStatus(entry.status))
        .filter((entry) => matchesEntryFilters(entry, options));
    if (entries.length === 0) {
        return 'No registered threads.';
    }

    if (options.json === true) {
        return JSON.stringify(entries, null, 2);
    }

    if (options.verbose === true) {
        return JSON.stringify(entries, null, 2);
    }

    return formatTable(entries.map((entry) => [
        entry.status,
        entry.task,
        entry.branch || '(detached)',
        entry.dirty ? `dirty:${entry.dirtyCount}` : 'clean',
        entry.running && entry.running !== 'none' ? entry.running : 'none',
        Number.isInteger(entry.ahead) && Number.isInteger(entry.behind) ? `${entry.ahead}/${entry.behind}` : '-/-',
        getPublicationLabel(entry),
    ]), ['STATUS', 'TASK', 'BRANCH', 'DIRTY', 'RUNNING', 'AHEAD/BEHIND', 'PUBLICATION']);
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
    if (!Number.isInteger(session?.pid) || session.pid <= 0 || !isAlive(session.pid)) {
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
        taskId: `task-${task.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-|-$)/g, '')}`,
        objective: typeof args.objective === 'string' ? args.objective.trim() : '',
        acceptanceCriteria: typeof args.acceptance === 'string' ? args.acceptance.split('|').map((item) => item.trim()).filter(Boolean) : [],
        kind: typeof args.kind === 'string' ? args.kind.trim() : 'leaf',
        integrationTaskId: typeof args.integration === 'string' ? args.integration.trim() : '',
        intendedBaseBranch: typeof args.base === 'string' ? args.base.trim() : snapshot.baseRef,
        publicationTarget: typeof args.base === 'string' ? args.base.trim() : snapshot.baseRef,
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
        objective: typeof args.objective === 'string' ? args.objective.trim() : existingEntry.objective ?? '',
        acceptanceCriteria: typeof args.acceptance === 'string' ? args.acceptance.split('|').map((item) => item.trim()).filter(Boolean) : existingEntry.acceptanceCriteria ?? [],
        kind: typeof args.kind === 'string' ? args.kind.trim() : existingEntry.kind ?? 'leaf',
        integrationTaskId: typeof args.integration === 'string' ? args.integration.trim() : existingEntry.integrationTaskId ?? '',
        intendedBaseBranch: typeof args.base === 'string' ? args.base.trim() : existingEntry.intendedBaseBranch ?? snapshot.baseRef,
        publicationTarget: typeof args.base === 'string' ? args.base.trim() : existingEntry.publicationTarget ?? snapshot.baseRef,
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

function handleStatus(registryPath, args) {
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
        }, { verbose: args.verbose === true, json: args.json === true }));
        return;
    }

    console.log(renderThreadList({
        version: 1,
        entries: [{
            ...entry,
            ...snapshot,
        }],
    }, { verbose: args.verbose === true, json: args.json === true }));
}

function getListOptions(args) {
    return {
        all: args.all === true,
        status: typeof args.status === 'string' ? args.status : '',
        task: typeof args.task === 'string' ? args.task : '',
        branch: typeof args.branch === 'string' ? args.branch : '',
        worktree: typeof args.worktree === 'string' ? args.worktree : '',
        verbose: args.verbose === true,
        json: args.json === true,
    };
}

function handleList(args, registryPath) {
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
    console.log(renderThreadList(registry, getListOptions(args)));
}

function findUnregisteredAttachedWorktrees(registry) {
    const output = runGitText(['worktree', 'list', '--porcelain'], process.cwd());
    return output.split(/\r?\n/).filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length))
        .filter((worktreePath) => !findThreadEntry(registry, { cwd: worktreePath }));
}

export function buildReconciliationPlan(registry, filters = {}) {
    return normalizeRegistry(registry).entries
        .filter((entry) => matchesEntryFilters(entry, filters))
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

function getMissingWorktreeProblems(entry) {
    if (!entry.missing) {
        return [];
    }

    if (isClosedStatus(entry.status)) {
        return entry.residualPathExists === true
            ? [['closed task residue', 'Inspect the residual task folder and reconcile only after confirming it is safe to remove.']]
            : [];
    }

    return entry.includedInMain
        ? [['stale integrated task', 'Run task:reconcile -- --apply to close and clean the integrated task.']]
        : [['missing active worktree', 'Restore or locate the task worktree before continuing.']];
}

function getPresentWorktreeProblems(entry) {
    const problems = [];
    if (!isClosedStatus(entry.status) && entry.dirty) {problems.push(['dirty active task', 'Commit, stash, or discard its task-owned changes before publishing or cleanup.']);}
    if (entry.status === 'blocked') {problems.push(['blocked task', entry.note || 'Read the task note, resolve the stated blocker, then update the task status.']);}
    if (entry.status === 'cleanup-pending') {problems.push(['cleanup pending', 'Run task:reconcile -- --apply after confirming containment.']);}
    if (entry.residualPathExists === true && entry.status === 'merged') {problems.push(['merged residue', 'Run task:reconcile -- --apply to remove the clean proven-integrated residue.']);}
    if (entry.includedInMain && !isClosedStatus(entry.status)) {problems.push(['stale integrated task', 'Run task:reconcile -- --apply to close and clean the integrated task.']);}
    return problems;
}

function getPublicationMetadataProblems(entry) {
    const publicationIsIncomplete = (entry.status === 'published' || entry.status === 'merge-queued')
        && (!entry.prNumber || !entry.publishedHead || !entry.baseSha || !entry.publishedAt);
    return publicationIsIncomplete
        ? [['invalid publication metadata', 'Republish the task after verifying its PR and remote branch.']]
        : [];
}

export function buildAuditReport(registry, options = {}) {
    const entries = normalizeRegistry(registry).entries.filter((entry) => matchesEntryFilters(entry, options));
    const counts = Object.groupBy(entries, (entry) => entry.status);
    const issues = entries.flatMap((entry) => {
        const lifecycleProblems = entry.missing ? getMissingWorktreeProblems(entry) : getPresentWorktreeProblems(entry);
        const problems = [...lifecycleProblems, ...getPublicationMetadataProblems(entry)];
        return problems.map(([issue, action]) => ({ status: entry.status, task: entry.task, branch: entry.branch, issue, action }));
    });
    return { counts, issues, entries };
}

export function renderAuditReport(report, options = {}) {
    if (options.json === true) {return JSON.stringify(report, null, 2);}
    const summary = Object.entries(report.counts).sort(([left], [right]) => left.localeCompare(right))
        .map(([status, entries]) => `${status}:${entries.length}`).join(', ') || 'none';
    if (report.issues.length === 0 && options.all !== true) {return `Task audit clean. Statuses: ${summary}.`;}
    const lines = [`Task audit. Statuses: ${summary}.`];
    if (report.issues.length > 0) {lines.push(formatTable(report.issues.map((issue) => [issue.status, issue.task, issue.branch, issue.issue, issue.action]), ['STATUS', 'TASK', 'BRANCH', 'ISSUE', 'NEXT ACTION']));}
    if (options.all === true) {lines.push(renderThreadList({ version: 1, entries: report.entries }, { ...options, all: true }));}
    return lines.join('\n');
}

function handleAudit(args, registryPath) {
    const storedRegistry = readThreadRegistry(registryPath);
    refreshQueuedPublicationState(storedRegistry);
    const registry = refreshThreadRegistry(storedRegistry);
    const options = getListOptions(args);
    const report = buildAuditReport(registry, options);
    const unregistered = findUnregisteredAttachedWorktrees(registry)
        .filter((worktreePath) => matchesEntryFilters({ task: 'unregistered', branch: '', status: 'active', cwd: worktreePath }, options));
    for (const worktreePath of unregistered) {
        report.issues.push({
            status: 'active',
            task: 'unregistered',
            branch: '-',
            issue: 'unregistered attached worktree',
            action: `Register it or inspect ${worktreePath} before publication.`,
        });
    }
    for (const storedEntry of storedRegistry.entries) {
        const currentEntry = findThreadEntry(registry, { cwd: storedEntry.cwd });
        if (currentEntry && storedEntry.branch && currentEntry.branch && storedEntry.branch !== currentEntry.branch) {
            report.issues.push({ status: currentEntry.status, task: storedEntry.task, branch: currentEntry.branch, issue: 'branch/worktree mismatch', action: 'Inspect the checkout and re-register the task only after confirming ownership.' });
        }
    }
    console.log(renderAuditReport(report, options));
    if (report.issues.some((issue) => ['dirty active task', 'blocked task', 'missing active worktree', 'invalid publication metadata', 'unregistered attached worktree', 'branch/worktree mismatch'].includes(issue.issue))) {
        process.exitCode = 1;
    }
}

function stopTaskRuntimeForCleanup(cwd) {
    if (collectThreadSnapshot(cwd).running === 'none') {return;}
    const result = runCommandSync({ command: process.execPath, args: [path.join(workspaceRoot, 'tooling', 'scripts', 'repo', 'thread-dev-session.js'), 'stop'], cwd, encoding: 'utf8' });
    if ((result.status ?? 1) !== 0) {throw new Error(`Unable to stop task-owned runtime in ${cwd}.`);}
}

function removeGitWorktree(cwd) {
    stopTaskRuntimeForCleanup(cwd);
    const result = runGit(['worktree', 'remove', cwd], process.cwd());
    if ((result.status ?? 1) !== 0) {throw new Error(`Unable to remove merged worktree ${cwd}. Resolve its Git worktree state and retry.`);}
}

function removeResidualTaskDirectory(cwd) {
    if (!/(?:^|\/)(?:\.worktrees|worktrees)\//u.test(normalizePathForKey(path.resolve(cwd)))) {
        throw new Error(`Refusing to remove unrecognized residual task directory: ${cwd}`);
    }
    rmSync(cwd, { recursive: true, force: true });
}

function removeReconciledWorktree(item) {
    if (!existsSync(item.cwd)) {return;}
    if (existsSync(path.join(item.cwd, '.git'))) {removeGitWorktree(item.cwd);}
    else {removeResidualTaskDirectory(item.cwd);}
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
    const entry = findThreadEntry(registry, { cwd: item.cwd });
    try {
        removeReconciledWorktree(item);
        removeReconciledBranch(item);
        closeThreadEntry(registry, item.cwd, 'merged');
        return { item, result: 'merged' };
    } catch (error) {
        if (entry) {
            upsertThreadEntry(registry, {
                ...entry,
                status: 'cleanup-pending',
                note: normalizeThreadNote(`${entry.note} | ${error instanceof Error ? error.message : String(error)}`),
                updatedAt: new Date().toISOString(),
            });
        }
        return { item, result: 'cleanup-pending', error: error instanceof Error ? error.message : String(error) };
    }
}

function getPullRequestRemoteState(prNumber) {
    const result = runCommandSync({ command: ghExecutable, args: ['pr', 'view', String(prNumber), '--json', 'state,comments'], cwd: process.cwd(), encoding: 'utf8' });
    return (result.status ?? 1) === 0 ? JSON.parse(result.stdout) : null;
}

function getQueueReason(remote) {
    return (remote.comments ?? []).toReversed()
        .map((comment) => typeof comment.body === 'string' ? comment.body.match(/queue-advance=([^\s]+)/u)?.[1] : '')
        .find(Boolean) ?? '';
}

function refreshQueuedEntry(registry, entry) {
    if (!entry.prNumber) {return;}
        const remote = getPullRequestRemoteState(entry.prNumber);
        if (!remote) {return;}
        const state = remote.state;
        const queueReason = getQueueReason(remote);
        if (queueReason) {
            upsertThreadEntry(registry, {
                ...entry,
                queueReason,
                note: normalizeThreadNote(`${entry.note} | queue-advance=${queueReason}`),
                updatedAt: new Date().toISOString(),
            });
        }
        if (state !== 'MERGED') {return;}
        const contained = entry.publishedHead && isBranchMergedIntoTargets({
            branch: entry.publishedHead,
            cwd: process.cwd(),
            targets: ['origin/main'],
        });
    upsertThreadEntry(registry, {
            ...entry,
            status: contained ? 'cleanup-pending' : 'blocked',
            includedInMain: contained,
            note: contained
                ? normalizeThreadNote(`${entry.note} | PR #${entry.prNumber} merged; cleanup pending.`)
                : normalizeThreadNote(`${entry.note} | PR #${entry.prNumber} reports merged but ${entry.publishedHead} is not contained in origin/main.`),
            updatedAt: new Date().toISOString(),
    });
}

function refreshQueuedPublicationState(registry) {
    const hasOrigin = runGit(['remote', 'get-url', 'origin'], process.cwd());
    if ((hasOrigin.status ?? 1) !== 0) {return;}
    const fetchResult = runGit(['fetch', 'origin', 'main'], process.cwd());
    if ((fetchResult.status ?? 1) !== 0) {throw new Error('Unable to fetch origin/main; reconciliation cannot prove remote containment.');}
    for (const entry of registry.entries.filter((candidate) => candidate.status === 'merge-queued' || candidate.status === 'published')) {
        refreshQueuedEntry(registry, entry);
    }
}

function handleReconcile(args, registryPath) {
    const registry = readThreadRegistry(registryPath);
    refreshQueuedPublicationState(registry);
    const refreshedRegistry = refreshThreadRegistry(registry);
    const filters = getListOptions(args);
    const plan = buildReconciliationPlan(refreshedRegistry, filters);
    if (plan.length === 0) {
        console.log('No stale task records found.');
        return;
    }

    const results = plan.map((item) => reconcilePlanItem({ args, item, registry: refreshedRegistry, registryPath }));
    if (args.apply === true) {
        const failures = results.filter((result) => result.result === 'cleanup-pending');
        console.log(getReconciliationSummary({ args, failures }));
        if (failures.length > 0) {process.exitCode = 1;}
    } else {
        console.log('Dry run only. Re-run from main with --apply to remove only clean, proven-merged residues.');
    }
}

function reconcilePlanItem({ args, item, registry, registryPath }) {
    console.log(`${item.action} | ${item.task} | ${item.cwd} | ${item.reason}`);
    if (args.apply !== true) {return null;}
    if (item.action === 'cleanup-merged-residue') {
        const result = applyReconciliationItem(registry, item);
        writeThreadRegistry(registryPath, registry);
        return result;
    }
    const entry = findThreadEntry(registry, { cwd: item.cwd });
    if (entry && entry.status !== 'blocked') {
        upsertThreadEntry(registry, { ...entry, status: 'blocked', note: normalizeThreadNote(`${entry.note} | ${item.reason}`), updatedAt: new Date().toISOString() });
        writeThreadRegistry(registryPath, registry);
    }
    return null;
}

function getReconciliationSummary({ args, failures }) {
    if (failures.length === 0) {return 'Applied verified cleanup of merged task residues. Unproven or dirty tasks were left intact.';}
    const taskFilter = typeof args.task === 'string' ? ` --task "${args.task}"` : '';
    return `Failed cleanup paths remain cleanup-pending; retry: pnpm.cmd run task:reconcile -- --apply${taskFilter}.`;
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
        handleStatus(registryPath, args);
        return;
    }

    if (command === 'list') {
        handleList(args, registryPath);
        return;
    }

    if (command === 'audit') {
        handleAudit(args, registryPath);
        return;
    }


    if (command === 'reconcile') {
        handleReconcile(args, registryPath);
        return;
    }

    if (command === 'overlap') {
        handleOverlap(args, registryPath);
        return;
    }

    console.error('Usage: node tooling/scripts/repo/thread-state.js <register|update|close|status|list|audit|reconcile|overlap> [--task "<task>"] [--status "<status>"] [--owner "<owner>"] [--note "<note>"] [--apply]');
    process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
