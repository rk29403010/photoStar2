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
const pnpmExecutable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const ghExecutable = process.platform === 'win32' ? 'gh.exe' : 'gh';

export function getShipIgnorePaths({ includeArtifacts = false } = {}) {
    return includeArtifacts ? ['.local'] : ['artifacts', '.local'];
}

function normalizePath(value) {
    return String(value ?? '').replaceAll('\\', '/').toLowerCase();
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

function pushWorktreeRecord(records, record) {
    if (record?.worktreePath) {
        records.push(record);
    }
}

export function parseWorktreeList(output) {
    const records = [];
    let currentRecord = null;

    for (const line of String(output ?? '').split(/\r?\n/)) {
        if (line === '') {
            pushWorktreeRecord(records, currentRecord);
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

    pushWorktreeRecord(records, currentRecord);

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

function runPnpm(args, cwd) {
    runCommandOrThrow({
        command: pnpmExecutable,
        args: ['pnpm', ...args],
        cwd,
        stdio: 'inherit',
    });
}

function canRun(command, args, cwd) {
    const result = runCommandSync({ command, args, cwd, encoding: 'utf8' });
    return (result.status ?? 1) === 0;
}

export function getIntegrationStrategy({ hasOrigin, githubAvailable }) {
    if (hasOrigin && githubAvailable) {
        return 'github-pr';
    }
    if (!hasOrigin) {
        return 'local-only';
    }
    return 'blocked';
}

function getCurrentThreadEntry(cwd) {
    const registryPath = resolveThreadRegistryPath(cwd);
    const registry = readThreadRegistry(registryPath);
    const snapshot = collectThreadSnapshot(cwd);
    return registry.entries.find((entry) => normalizePath(entry.cwd) === normalizePath(snapshot.cwd)) ?? null;
}

export function getShipMode(snapshot) {
    return snapshot.worktreeName === 'main' || snapshot.branch === 'main' ? 'main' : 'worktree';
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

function pushBranch(cwd, branch) {
    runGit(['push', '--set-upstream', 'origin', branch], cwd);
}

function integrateWithGitHub({ cwd, branch }) {
    const existingPr = runCommandSync({
        command: ghExecutable,
        args: ['pr', 'view', branch, '--json', 'state', '--jq', '.state'],
        cwd,
        encoding: 'utf8',
    });
    const existingState = (existingPr.status ?? 1) === 0 ? existingPr.stdout.trim() : '';
    if (existingState === 'MERGED') {
        runGit(['fetch', 'origin', 'main'], cwd);
        return;
    }
    pushBranch(cwd, branch);
    if (existingState !== 'OPEN') {
        runCommandOrThrow({
            command: ghExecutable,
            args: ['pr', 'create', '--fill', '--head', branch, '--base', 'main'],
            cwd,
            stdio: 'inherit',
        });
    }
    runCommandOrThrow({
        command: ghExecutable,
        args: ['pr', 'checks', branch, '--watch', '--fail-fast'],
        cwd,
        stdio: 'inherit',
    });
    runCommandOrThrow({
        command: ghExecutable,
        args: ['pr', 'merge', branch, '--merge', '--delete-branch'],
        cwd,
        stdio: 'inherit',
    });
    runGit(['fetch', 'origin', 'main'], cwd);
}

function verifyIntegrated({ cwd, head, target = 'origin/main' }) {
    const result = runCommandSync({
        command: gitExecutable,
        args: ['merge-base', '--is-ancestor', head, target],
        cwd,
        encoding: 'utf8',
    });
    if ((result.status ?? 1) !== 0) {
        throw new Error(`Integration could not be proven: ${head} is not contained in ${target}. The task was left intact.`);
    }
}

function configureMainProtection(mainWorktreePath) {
    runNode([
        path.join(mainWorktreePath, 'tooling', 'scripts', 'repo', 'configure-main-protection.js'),
    ], mainWorktreePath);
}

function closeMergedThread(cwd, removedWorktreePath) {
    runNode([
        path.join(cwd, 'tooling', 'scripts', 'repo', 'thread-state.js'),
        'close',
        '--status',
        'merged',
        '--cwd',
        removedWorktreePath,
    ], cwd);
}

function updateThreadStatus(cwd, status) {
    runNode([path.join(workspaceRoot, 'tooling', 'scripts', 'repo', 'thread-state.js'), 'update', '--status', status], cwd);
}

function cleanupMergedWorktree({ branch, worktreePath, mainWorktreePath }) {
    process.chdir(mainWorktreePath);
    runGit(['worktree', 'remove', worktreePath], mainWorktreePath);
    runGit(['branch', '-d', branch], mainWorktreePath);
}

function stageAndCommitCurrentCheckout({ cwd, commitMessage, ignorePaths }) {
    const entry = getCurrentThreadEntry(cwd);
    stopManagedSession(cwd);
    stageThreadChanges(cwd, ignorePaths);

    const stagedFiles = getStagedFiles(cwd);
    if (stagedFiles.length > 0) {
        runPnpm(['run', 'quality:staged'], cwd);
        runGit(['commit', '-m', commitMessage], cwd);
    }

    runPnpm(['run', 'qa:merge'], cwd);

    return { entry, stagedFiles };
}

function shipMain({ cwd, commitMessage, ignorePaths }) {
    if (canRun(gitExecutable, ['remote', 'get-url', 'origin'], cwd)) {
        throw new Error('Refusing to ship directly from main. Create or switch to a task branch/worktree so the protected GitHub PR gate can run.');
    }
    stageAndCommitCurrentCheckout({ cwd, commitMessage, ignorePaths });
    console.log('Committed and verified main locally; no origin remote is configured.');
}

function shipWorktree({ cwd, snapshot, commitMessage, ignorePaths }) {
    if (snapshot.detached || !snapshot.branch) {
        throw new Error('Cannot ship a detached checkout. Attach it to a task branch first; no merge or cleanup was attempted.');
    }
    const { entry } = stageAndCommitCurrentCheckout({ cwd, commitMessage, ignorePaths });
    const head = runGitText(['rev-parse', 'HEAD'], cwd);

    const worktreeRecords = parseWorktreeList(runGitText(['worktree', 'list', '--porcelain'], cwd));
    const mainWorktreePath = resolveMainWorktreePath(worktreeRecords);
    ensureMainWorkspaceReady(mainWorktreePath);
    const hasOrigin = canRun(gitExecutable, ['remote', 'get-url', 'origin'], cwd);
    const githubAvailable = canRun(ghExecutable, ['auth', 'status'], cwd);
    const strategy = getIntegrationStrategy({ hasOrigin, githubAvailable });
    if (strategy === 'blocked') {
        throw new Error('Shipping requires an authenticated GitHub CLI because origin is configured and main is protected. Run `gh auth login`, then retry; the committed task branch was left intact.');
    }
    if (strategy === 'github-pr') {
        integrateWithGitHub({ cwd, branch: snapshot.branch });
        verifyIntegrated({ cwd, head });
        runGit(['merge', '--ff-only', 'origin/main'], mainWorktreePath);
        configureMainProtection(mainWorktreePath);
    } else {
        mergeBranchIntoMain({ branch: snapshot.branch, mainWorktreePath });
        verifyIntegrated({ cwd: mainWorktreePath, head, target: 'main' });
        console.warn('No origin remote is configured; integration was completed locally and was not pushed.');
    }
    if (entry) {
        updateThreadStatus(cwd, 'cleanup-pending');
    }
    try {
        cleanupMergedWorktree({
            branch: snapshot.branch,
            worktreePath: snapshot.worktreePath,
            mainWorktreePath,
        });
        if (entry) {
            closeMergedThread(mainWorktreePath, snapshot.worktreePath);
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`The change is merged and verified, but local cleanup did not finish: ${detail} Run thread:reconcile from main, inspect the dry run, then retry with --apply.`);
    }

    console.log(`Shipped ${snapshot.branch} through ${strategy}, verified integration, and removed its worktree and local branch.`);
}

function main() {
    const cwd = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const ignorePaths = getShipIgnorePaths({
        includeArtifacts: args['include-artifacts'] === true,
    });
    const snapshot = collectThreadSnapshot(cwd);
    const entry = getCurrentThreadEntry(cwd);
    const commitMessage = typeof args.message === 'string' && args.message.trim() !== ''
        ? args.message.trim()
        : getShipCommitMessage({ task: entry?.task ?? '', branch: snapshot.branch });

    if (getShipMode(snapshot) === 'main') {
        shipMain({ cwd, commitMessage, ignorePaths });
        return;
    }

    shipWorktree({ cwd, snapshot, commitMessage, ignorePaths });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
    }
}
