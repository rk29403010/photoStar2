#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runCommandSync } from './process-invocation.js';
import {
    collectThreadSnapshot,
    findThreadEntry,
    readThreadRegistry,
    resolveThreadRegistryPath,
    upsertThreadEntry,
    writeThreadRegistry,
} from './thread-state.js';
import { normalizeThreadSlug } from './thread-bootstrap.js';

const gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';
const CLOSED_STATUSES = new Set(['parked', 'merged', 'discarded']);

function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {continue;}
        const key = token.slice(2);
        const value = argv[index + 1];
        args[key] = !value || value.startsWith('--') ? true : value;
        if (args[key] !== true) {index += 1;}
    }
    return args;
}

function git(args, cwd) {
    const result = runCommandSync({ command: gitExecutable, args, cwd, encoding: 'utf8' });
    if ((result.status ?? 1) !== 0) {throw new Error(result.stderr?.trim() || `Git command failed: ${args.join(' ')}`);}
    return result.stdout.trim();
}

function gitResult(args, cwd) {
    return runCommandSync({ command: gitExecutable, args, cwd, encoding: 'utf8' });
}

function requireTask(args) {
    if (typeof args.task !== 'string' || args.task.trim() === '') {
        throw new Error('Usage: task:start -- --task "<task>" [--workspace worktree] [--branch "<neutral branch>"] [--path "<worktree path>"]');
    }
    return args.task.trim();
}

function assertWorktreeMode(args) {
    if (args.workspace !== undefined && args.workspace !== 'worktree') {
        throw new Error('Only the editor-neutral Git worktree workspace is supported. Use --workspace worktree or omit it.');
    }
}

function pathKey(targetPath) {return path.resolve(targetPath).replaceAll('\\', '/').toLowerCase();}

function isClosed(entry) {return CLOSED_STATUSES.has(entry.status);}

function rootFromCommonDir(cwd) {
    const commonDir = path.resolve(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd));
    const marker = `${path.sep}.git`;
    const markerIndex = commonDir.toLowerCase().lastIndexOf(marker.toLowerCase());
    if (markerIndex === -1) {throw new Error(`Unable to resolve the primary checkout from ${commonDir}.`);}
    return commonDir.slice(0, markerIndex);
}

function assertClean(cwd, purpose) {
    if (git(['status', '--short'], cwd) !== '') {
        throw new Error(`Refusing to ${purpose}: workspace has uncommitted changes at ${cwd}.`);
    }
}

function refreshPrimaryMain(primaryPath) {
    assertClean(primaryPath, 'refresh main');
    if (git(['branch', '--show-current'], primaryPath) !== 'main') {git(['switch', 'main'], primaryPath);}
    git(['fetch', 'origin', 'main'], primaryPath);
    git(['merge', '--ff-only', 'origin/main'], primaryPath);
}

function findAttachedWorktreeByBranch(cwd, branch) {
    const blocks = git(['worktree', 'list', '--porcelain'], cwd).split(/\r?\n\r?\n/).filter(Boolean);
    for (const block of blocks) {
        const lines = block.split(/\r?\n/);
        const branchLine = lines.find((line) => line.startsWith('branch '));
        if (branchLine?.slice('branch refs/heads/'.length) !== branch) {continue;}
        return lines.find((line) => line.startsWith('worktree '))?.slice(9) ?? '';
    }
    return '';
}

function activeEntries(registry) {return registry.entries.filter((entry) => !isClosed(entry));}

function getDefaultWorktreePath(primaryPath, task) {
    return path.join(primaryPath, '.worktrees', normalizeThreadSlug(task));
}

function resolveRequestedWorktreePath(args, primaryPath, task) {
    if (typeof args.path === 'string' && args.path.trim() !== '') {return path.resolve(args.path.trim());}
    return getDefaultWorktreePath(primaryPath, task);
}

function assertTaskIsUnbound(registry, task, branch, targetPath = '') {
    const conflict = activeEntries(registry).find((entry) => (entry.task.toLowerCase() === task.toLowerCase() || entry.branch === branch)
        && (!targetPath || pathKey(entry.cwd) !== pathKey(targetPath)));
    if (conflict) {
        throw new Error(`Task "${task}" / branch "${branch}" is already bound to active workspace ${conflict.cwd}. Resume or relocate that registered worktree; do not edit it in two places.`);
    }
}

function assertWorkspaceIsUnbound(registry, cwd, task) {
    const conflict = activeEntries(registry).find((entry) => pathKey(entry.cwd) === pathKey(cwd) && entry.task.toLowerCase() !== task.toLowerCase());
    if (conflict) {throw new Error(`Workspace ${cwd} is already bound to active task "${conflict.task}".`);}
}

function registerTask({ registry, registryPath, task, branch, cwd, existingEntry = null }) {
    const snapshot = collectThreadSnapshot(cwd);
    if (!snapshot.branch) {throw new Error(`Cannot register detached workspace ${cwd}. Check out the task branch first.`);}
    if (snapshot.branch !== branch) {throw new Error(`Workspace branch "${snapshot.branch}" does not match task branch "${branch}".`);}
    upsertThreadEntry(registry, {
        ...existingEntry,
        ...snapshot,
        task,
        taskId: existingEntry?.taskId ?? `task-${normalizeThreadSlug(task)}`,
        kind: existingEntry?.kind ?? 'leaf',
        integrationTaskId: existingEntry?.integrationTaskId ?? '',
        intendedBaseBranch: existingEntry?.intendedBaseBranch ?? 'main',
        publicationTarget: existingEntry?.publicationTarget ?? 'main',
        workspaceMode: 'worktree',
        status: 'active',
        owner: existingEntry?.owner ?? '',
        note: existingEntry?.note ?? '',
        updatedAt: new Date().toISOString(),
    });
    writeThreadRegistry(registryPath, registry);
    return findThreadEntry(registry, { cwd });
}

export function buildTaskStartPlan({ task, branch = '', workspacePath = '' }) {
    return {
        task,
        taskId: `task-${normalizeThreadSlug(task)}`,
        branch: branch || `task/${normalizeThreadSlug(task)}`,
        workspace: 'worktree',
        workspacePath,
    };
}

function render(entry, json) {
    const output = {
        task: entry.task,
        taskId: entry.taskId,
        branch: entry.branch,
        workspaceMode: 'worktree',
        workspacePath: entry.cwd,
        status: entry.status,
    };
    return json ? JSON.stringify(output, null, 2) : `Task: ${output.task}\nTask ID: ${output.taskId}\nBranch: ${output.branch}\nWorkspace: ${output.workspaceMode}\nPath: ${output.workspacePath}\nStatus: ${output.status}`;
}

function start(args) {
    assertWorktreeMode(args);
    const task = requireTask(args);
    const branch = typeof args.branch === 'string' && args.branch.trim() !== '' ? args.branch.trim() : `task/${normalizeThreadSlug(task)}`;
    const registryPath = resolveThreadRegistryPath(process.cwd());
    const registry = readThreadRegistry(registryPath);
    const existing = activeEntries(registry).find((entry) => entry.task.toLowerCase() === task.toLowerCase() || entry.branch === branch);
    if (existing) {
        assertTaskIsUnbound(registry, task, branch, existing.cwd);
        const snapshot = collectThreadSnapshot(existing.cwd);
        if (snapshot.branch !== branch) {throw new Error(`Registered workspace ${existing.cwd} no longer has task branch "${branch}" checked out.`);}
        const attachedPath = findAttachedWorktreeByBranch(existing.cwd, branch);
        if (pathKey(attachedPath) !== pathKey(existing.cwd)) {throw new Error(`Task branch "${branch}" is active at a different Git worktree: ${attachedPath}.`);}
        console.log(render(existing, args.json === true));
        return;
    }

    const primaryPath = rootFromCommonDir(process.cwd());
    const worktreePath = resolveRequestedWorktreePath(args, primaryPath, task);
    assertTaskIsUnbound(registry, task, branch, worktreePath);
    const attachedPath = findAttachedWorktreeByBranch(primaryPath, branch);
    if (attachedPath) {throw new Error(`Task branch "${branch}" is already active at ${attachedPath}. Register that worktree instead of creating another.`);}
    if (existsSync(worktreePath)) {throw new Error(`Worktree path already exists: ${worktreePath}. Use task:register for an editor-created worktree.`);}
    refreshPrimaryMain(primaryPath);
    const branchExists = (gitResult(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], primaryPath).status ?? 1) === 0;
    git(branchExists ? ['worktree', 'add', worktreePath, branch] : ['worktree', 'add', '-b', branch, worktreePath, 'main'], primaryPath);
    console.log(render(registerTask({ registry, registryPath, task, branch, cwd: worktreePath }), args.json === true));
}

function register(args) {
    assertWorktreeMode(args);
    const task = requireTask(args);
    const snapshot = collectThreadSnapshot(process.cwd());
    const branch = typeof args.branch === 'string' && args.branch.trim() !== '' ? args.branch.trim() : snapshot.branch;
    if (!branch) {throw new Error('Registering a task requires a checked-out branch.');}
    const registryPath = resolveThreadRegistryPath(process.cwd());
    const registry = readThreadRegistry(registryPath);
    const existing = activeEntries(registry).find((entry) => entry.task.toLowerCase() === task.toLowerCase() || entry.branch === branch) ?? null;
    assertWorkspaceIsUnbound(registry, snapshot.cwd, task);
    assertTaskIsUnbound(registry, task, branch, snapshot.cwd);
    const attachedPath = findAttachedWorktreeByBranch(snapshot.cwd, branch);
    if (pathKey(attachedPath) !== pathKey(snapshot.cwd)) {throw new Error(`Task branch "${branch}" is active at a different Git worktree: ${attachedPath}.`);}
    console.log(render(registerTask({ registry, registryPath, task, branch, cwd: snapshot.cwd, existingEntry: existing && pathKey(existing.cwd) === pathKey(snapshot.cwd) ? existing : null }), args.json === true));
}

function main() {
    const [command, ...rest] = process.argv.slice(2);
    const args = parseArgs(rest);
    if (command === 'start') {start(args); return;}
    if (command === 'register') {register(args); return;}
    throw new Error('Usage: task-workspace.js <start|register> --task "<task>" [--workspace worktree] [--path "<worktree path>"] [--json]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {main();} catch (error) {console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;}
}
