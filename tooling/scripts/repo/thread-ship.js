#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runCommandSync } from './process-invocation.js';
import {
    collectThreadSnapshot,
    readThreadRegistry,
    resolveThreadRegistryPath,
} from './thread-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';
const nodeExecutable = process.execPath;
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export function getShipIgnorePaths({ includeArtifacts = false } = {}) {
    return includeArtifacts ? ['.local'] : ['artifacts', '.local'];
}

function normalizePath(value) {
    return String(value ?? '').replace(/\\/g, '/').toLowerCase();
}

function isIgnoredShipPath(filePath, ignorePaths = getShipIgnorePaths()) {
    const normalizedPath = normalizePath(filePath);
    return ignorePaths.some((ignorePath) => {
        const normalizedIgnorePath = normalizePath(ignorePath);
        return normalizedPath === normalizedIgnorePath || normalizedPath.startsWith(`${normalizedIgnorePath}/`);
    });
}

export function parseGitStatusLines(statusText, ignorePaths = getShipIgnorePaths()) {
    return String(statusText ?? '')
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .map((line) => {
            const code = line.slice(0, 2);
            const rawPath = line.slice(3).trim();
            const resolvedPath = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) ?? rawPath : rawPath;
            return { code, path: resolvedPath };
        })
        .filter((entry) => !isIgnoredShipPath(entry.path, ignorePaths));
}

export function parseWorktreeList(output) {
    const records = [];
    let currentRecord = null;

    for (const line of String(output ?? '').split(/\r?\n/)) {
        if (line === '') {
            if (currentRecord?.worktreePath) {
                records.push(currentRecord);
            }
            currentRecord = null;
            continue;
        }

        if (line.startsWith('worktree ')) {
            currentRecord = { worktreePath: line.slice('worktree '.length), branchRef: '' };
            continue;
        }

        if (line.startsWith('branch ') && currentRecord) {
            currentRecord.branchRef = line.slice('branch '.length);
        }
    }

    if (currentRecord?.worktreePath) {
        records.push(currentRecord);
    }

    return records;
}

export function resolveMainWorktreePath(records) {
    const mainRecord = records.find((record) => record.branchRef === 'refs/heads/main');
    if (!mainRecord?.worktreePath) {
        throw new Error('Unable to locate the main worktree.');
    }

    return mainRecord.worktreePath;
}

export function getShipCommitMessage({ task, branch }) {
    return typeof task === 'string' && task.trim() !== ''
        ? `Finish thread: ${task.trim()}`
        : `Finish branch: ${branch}`;
}

function parseArgs(argv) {
    const parsed = {};

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
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

function runCommandOrThrow({ command, args, cwd, encoding = 'utf8', stdio = 'pipe' }) {
    const result = runCommandSync({
        command,
        args,
        cwd,
        encoding,
        stdio,
    });

    if ((result.status ?? 1) !== 0) {
        const stderr = result.stderr?.trim();
        throw new Error(stderr || `${command} ${args.join(' ')} failed.`);
    }

    return result;
}

function runGitText(args, cwd) {
    return runCommandOrThrow({
        command: gitExecutable,
        args,
        cwd,
        encoding: 'utf8',
    }).stdout.trim();
}

function runGit(args, cwd) {
    runCommandOrThrow({
        command: gitExecutable,
        args,
        cwd,
        stdio: 'inherit',
    });
}

function runNode(args, cwd) {
    runCommandOrThrow({
        command: nodeExecutable,
        args,
        cwd,
        stdio: 'inherit',
    });
}

function runNpm(args, cwd) {
    runCommandOrThrow({
        command: npmExecutable,
        args,
        cwd,
        stdio: 'inherit',
    });
}

function getCurrentThreadEntry(cwd) {
    const registryPath = resolveThreadRegistryPath(cwd);
    const registry = readThreadRegistry(registryPath);
    const snapshot = collectThreadSnapshot(cwd);
    return registry.entries.find((entry) => normalizePath(entry.cwd) === normalizePath(snapshot.cwd)) ?? null;
}

function ensureWorktreeContext(snapshot) {
    if (snapshot.worktreeName === 'main' || snapshot.branch === 'main') {
        throw new Error('Ship must be run from a dedicated worktree branch, not from main.');
    }
}

function unstageIgnoredPaths(cwd, ignorePaths) {
    const presentPaths = ignorePaths.filter((ignorePath) => existsSync(path.join(cwd, ignorePath)));
    if (presentPaths.length > 0) {
        runGit(['reset', 'HEAD', '--', ...presentPaths], cwd);
    }
}

function stageThreadChanges(cwd, ignorePaths) {
    runGit(['add', '-A', '--', '.'], cwd);
    unstageIgnoredPaths(cwd, ignorePaths);
}

function getStagedFiles(cwd) {
    return runGitText(['diff', '--cached', '--name-only', '--diff-filter=ACMRTUXB'], cwd)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function ensureMainWorkspaceReady(mainWorktreePath) {
    const statusLines = parseGitStatusLines(runGitText(['status', '--short'], mainWorktreePath));
    if (statusLines.length > 0) {
        const summary = statusLines.map((entry) => `${entry.code} ${entry.path}`).join(', ');
        throw new Error(`Main worktree has local changes that block shipping: ${summary}`);
    }
}

function stopManagedSession(cwd) {
    runNode([path.join(workspaceRoot, 'tooling', 'scripts', 'repo', 'thread-dev-session.js'), 'stop'], cwd);
}

function mergeBranchIntoMain({ branch, mainWorktreePath }) {
    runGit(['merge', '--no-ff', branch, '-m', `Merge branch '${branch}'`], mainWorktreePath);
}

function pushMain(mainWorktreePath) {
    runGit(['push', 'origin', 'main'], mainWorktreePath);
}

function closeMergedThread(cwd) {
    runNode([path.join(workspaceRoot, 'tooling', 'scripts', 'repo', 'thread-state.js'), 'close', '--status', 'merged'], cwd);
}

function cleanupMergedWorktree({ branch, worktreePath, mainWorktreePath }) {
    process.chdir(mainWorktreePath);
    runGit(['worktree', 'remove', worktreePath], mainWorktreePath);
    runGit(['branch', '-d', branch], mainWorktreePath);
}

function main() {
    const cwd = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const ignorePaths = getShipIgnorePaths({
        includeArtifacts: args['include-artifacts'] === true,
    });
    const snapshot = collectThreadSnapshot(cwd);
    ensureWorktreeContext(snapshot);

    const entry = getCurrentThreadEntry(cwd);
    const commitMessage = typeof args.message === 'string' && args.message.trim() !== ''
        ? args.message.trim()
        : getShipCommitMessage({ task: entry?.task ?? '', branch: snapshot.branch });

    stopManagedSession(cwd);
    stageThreadChanges(cwd, ignorePaths);

    const stagedFiles = getStagedFiles(cwd);
    if (stagedFiles.length > 0) {
        runNpm(['run', 'quality:staged'], cwd);
        runGit(['commit', '-m', commitMessage], cwd);
    }

    const worktreeRecords = parseWorktreeList(runGitText(['worktree', 'list', '--porcelain'], cwd));
    const mainWorktreePath = resolveMainWorktreePath(worktreeRecords);
    ensureMainWorkspaceReady(mainWorktreePath);
    mergeBranchIntoMain({ branch: snapshot.branch, mainWorktreePath });
    pushMain(mainWorktreePath);
    closeMergedThread(cwd);
    cleanupMergedWorktree({
        branch: snapshot.branch,
        worktreePath: snapshot.worktreePath,
        mainWorktreePath,
    });

    console.log(`Shipped ${snapshot.branch} to main and pushed origin/main.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
