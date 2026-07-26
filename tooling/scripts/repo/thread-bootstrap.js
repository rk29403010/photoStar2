#!/usr/bin/env node
import { existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runCommandSync } from './process-invocation.js';
import {
    collectThreadSnapshot,
    readThreadRegistry,
    resolveThreadRegistryPath,
    upsertThreadEntry,
    writeThreadRegistry,
} from './thread-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';
const nodeExecutable = process.execPath;
const DEFAULT_BRANCH_PREFIX = 'task';
const WORKTREE_DIRECTORY_CANDIDATES = ['.worktrees', 'worktrees'];

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

function requireTask(task) {
    if (typeof task !== 'string' || task.trim() === '') {
        throw new Error('Usage: node tooling/scripts/repo/thread-bootstrap.js --task "<task>" [--kind leaf|integration] [--integration "<task id>"] [--owner "<owner>"]');
    }

    return task.trim();
}

export function normalizeThreadSlug(task) {
    const normalizedTask = String(task)
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '-')
        .split('-')
        .filter(Boolean)
        .join('-');
    return normalizedTask || 'thread';
}

export function resolvePreferredWorktreeDirectory({
    availableDirectories,
    ignoredDirectories,
}) {
    for (const candidate of WORKTREE_DIRECTORY_CANDIDATES) {
        if (!availableDirectories.has(candidate)) {
            continue;
        }

        if (!ignoredDirectories.has(candidate)) {
            throw new Error(`Worktree directory "${candidate}" must be git-ignored before automatic thread creation can use it.`);
        }

        return candidate;
    }

    throw new Error('No supported worktree directory found. Expected .worktrees/ or worktrees/.');
}

export function buildThreadBootstrapPlan({
    task,
    workspaceRoot: targetWorkspaceRoot,
    worktreeDirectory,
    branchPrefix = DEFAULT_BRANCH_PREFIX,
    kind = 'leaf',
    baseBranch = 'origin/main',
}) {
    const slug = normalizeThreadSlug(task);
    return {
        task,
        slug,
        branch: `${kind === 'integration' ? 'integration' : branchPrefix}/${slug}`,
        baseBranch,
        kind,
        worktreePath: path.join(targetWorkspaceRoot, worktreeDirectory, slug),
    };
}

export function buildSharedNodeModulesPlan({
    workspaceRoot: targetWorkspaceRoot,
    worktreePath,
}) {
    return {
        sourceNodeModulesPath: path.join(targetWorkspaceRoot, 'node_modules'),
        targetNodeModulesPath: path.join(worktreePath, 'node_modules'),
    };
}

export function resolveRepositoryRootFromCommonDir(commonDirPath) {
    const normalizedPath = path.resolve(commonDirPath);
    const segments = normalizedPath.split(path.sep);
    const gitIndex = segments.lastIndexOf('.git');
    if (gitIndex === -1) {
        throw new Error(`Unable to resolve repository root from git common dir: ${commonDirPath}`);
    }

    const gitDirectory = segments.slice(0, gitIndex + 1).join(path.sep);
    return path.dirname(gitDirectory);
}

function collectAvailableDirectories(targetWorkspaceRoot) {
    return new Set(
        WORKTREE_DIRECTORY_CANDIDATES.filter((candidate) => existsSync(path.join(targetWorkspaceRoot, candidate))),
    );
}

function getIgnoredDirectories(targetWorkspaceRoot) {
    const ignoredDirectories = new Set();

    for (const candidate of WORKTREE_DIRECTORY_CANDIDATES) {
        const result = runCommandSync({
            command: gitExecutable,
            args: ['check-ignore', candidate],
            cwd: targetWorkspaceRoot,
            encoding: 'utf8',
        });

        if ((result.status ?? 1) === 0) {
            ignoredDirectories.add(candidate);
        }
    }

    return ignoredDirectories;
}

function runGitText(args, cwd) {
    const result = runCommandSync({
        command: gitExecutable,
        args,
        cwd,
        encoding: 'utf8',
    });

    if ((result.status ?? 1) !== 0) {
        const stderr = result.stderr?.trim();
        throw new Error(stderr || `Git command failed: ${args.join(' ')}`);
    }

    return result.stdout.trim();
}

function resolveWorkspaceRoot(cwd = process.cwd()) {
    const commonDir = runGitText(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
    return path.resolve(resolveRepositoryRootFromCommonDir(commonDir));
}

function ensureBranchDoesNotExist(branch, cwd) {
    const result = runCommandSync({
        command: gitExecutable,
        args: ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
        cwd,
        encoding: 'utf8',
    });

    if ((result.status ?? 1) === 0) {
        throw new Error(`Branch "${branch}" already exists.`);
    }
}

function ensureWorktreePathAvailable(worktreePath) {
    if (existsSync(worktreePath)) {
        throw new Error(`Worktree path already exists: ${worktreePath}`);
    }
}

function createWorktree({ branch, baseBranch, worktreePath, cwd }) {
    runGitText(['worktree', 'add', worktreePath, '-b', branch, baseBranch], cwd);
}

function ensureSharedNodeModulesLink({
    workspaceRoot: targetWorkspaceRoot,
    worktreePath,
}) {
    const { sourceNodeModulesPath, targetNodeModulesPath } = buildSharedNodeModulesPlan({
        workspaceRoot: targetWorkspaceRoot,
        worktreePath,
    });

    if (!existsSync(sourceNodeModulesPath) || existsSync(targetNodeModulesPath)) {
        return false;
    }

    symlinkSync(
        sourceNodeModulesPath,
        targetNodeModulesPath,
        process.platform === 'win32' ? 'junction' : 'dir',
    );
    return true;
}

function registerNewThread({
    task,
    owner,
    note,
    worktreePath, kind, integrationTaskId, publicationTarget,
}) {
    const registryPath = resolveThreadRegistryPath(worktreePath);
    const registry = readThreadRegistry(registryPath);
    const snapshot = collectThreadSnapshot(worktreePath);
    const timestamp = new Date().toISOString();

    upsertThreadEntry(registry, {
        ...snapshot,
        task,
        taskId: `task-${normalizeThreadSlug(task)}`,
        objective: '',
        acceptanceCriteria: [],
        kind,
        integrationTaskId,
        intendedBaseBranch: publicationTarget,
        publicationTarget,
        status: 'active',
        owner,
        note,
        updatedAt: timestamp,
    });
    writeThreadRegistry(registryPath, registry);
}

function startManagedDevSession({
    task,
    owner,
    note,
    worktreePath,
    script,
    workspaceRoot: targetWorkspaceRoot,
}) {
    const scriptPath = path.join(targetWorkspaceRoot, 'tooling', 'scripts', 'repo', 'thread-dev-session.js');
    const args = [scriptPath, '--script', script];

    if (task) {
        args.push('--task', task);
    }
    if (owner) {
        args.push('--owner', owner);
    }
    if (note) {
        args.push('--note', note);
    }

    const result = runCommandSync({
        command: nodeExecutable,
        args,
        cwd: worktreePath,
        encoding: 'utf8',
    });

    if ((result.status ?? 1) !== 0) {
        const stderr = result.stderr?.trim();
        throw new Error(stderr || 'Unable to start managed dev session for new thread.');
    }

    return result.stdout?.trim() ?? '';
}

export function buildThreadBootstrapSummary({
    plan,
    linkedSharedNodeModules,
    devSessionOutput,
}) {
    const lines = [
        `Created thread "${plan.task}".`,
        `Branch: ${plan.branch}`,
        `Worktree: ${plan.worktreePath}`,
    ];

    if (linkedSharedNodeModules) {
        lines.push('Linked worktree node_modules to the main workspace node_modules.');
    }
    if (devSessionOutput) {
        lines.push(devSessionOutput);
    }

    return lines.join('\n');
}

function resolveTaskTopology(args, registry) {
    const kind = typeof args.kind === 'string' ? args.kind.trim() : 'leaf';
    if (!['leaf', 'integration'].includes(kind)) {throw new Error('Task kind must be leaf or integration.');}
    const integrationTaskId = typeof args.integration === 'string' ? args.integration.trim() : '';
    if (kind === 'integration' && integrationTaskId) {throw new Error('Integration tasks cannot have an integration parent.');}
    const integrationEntry = integrationTaskId ? registry.entries.find((entry) => entry.task === integrationTaskId && entry.kind === 'integration') : null;
    if (integrationTaskId && !integrationEntry) {throw new Error(`Integration task "${integrationTaskId}" is not registered.`);}
    return { kind, integrationTaskId, publicationTarget: kind === 'integration' ? 'main' : integrationEntry?.branch ?? 'main' };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const task = requireTask(args.task);
    const owner = typeof args.owner === 'string' ? args.owner.trim() : '';
    const note = typeof args.note === 'string' ? args.note.trim() : '';
    const workspaceRoot = resolveWorkspaceRoot(process.cwd());
    const availableDirectories = collectAvailableDirectories(workspaceRoot);
    const ignoredDirectories = getIgnoredDirectories(workspaceRoot);
    const worktreeDirectory = resolvePreferredWorktreeDirectory({
        availableDirectories,
        ignoredDirectories,
    });
    const registryPath = resolveThreadRegistryPath(process.cwd());
    const registry = readThreadRegistry(registryPath);
    const { kind, integrationTaskId, publicationTarget } = resolveTaskTopology(args, registry);
    if (publicationTarget === 'main') {
        runGitText(['fetch', 'origin', 'main'], workspaceRoot);
    }
    const plan = buildThreadBootstrapPlan({
        task,
        workspaceRoot,
        worktreeDirectory,
        branchPrefix: typeof args['branch-prefix'] === 'string'
            ? args['branch-prefix'].trim()
            : DEFAULT_BRANCH_PREFIX,
        kind,
        baseBranch: publicationTarget === 'main' ? 'origin/main' : publicationTarget,
    });

    ensureBranchDoesNotExist(plan.branch, workspaceRoot);
    ensureWorktreePathAvailable(plan.worktreePath);
    createWorktree({
        branch: plan.branch,
        baseBranch: plan.baseBranch,
        worktreePath: plan.worktreePath,
        cwd: workspaceRoot,
    });
    const linkedSharedNodeModules = args['share-dependencies'] === true
        ? ensureSharedNodeModulesLink({
            workspaceRoot,
            worktreePath: plan.worktreePath,
        })
        : false;
    registerNewThread({
        task: plan.task,
        owner,
        note,
        worktreePath: plan.worktreePath,
        kind,
        integrationTaskId,
        publicationTarget,
    });

    let devSessionOutput = '';
    if (args['start-dev']) {
        const script = typeof args.script === 'string' ? args.script.trim() : 'dev:desktop-runtime';
        devSessionOutput = startManagedDevSession({
            task: plan.task,
            owner,
            note,
            worktreePath: plan.worktreePath,
            script,
            workspaceRoot,
        });
    }

    console.log(buildThreadBootstrapSummary({
        plan,
        linkedSharedNodeModules,
        devSessionOutput,
    }));
  }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
