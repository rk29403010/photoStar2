#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommandSync } from './process-invocation.js';
import { resolvePlatformTools } from './platform-tools.js';
import {
    collectThreadSnapshot,
    readThreadRegistry,
    resolveThreadRegistryPath,
    upsertThreadEntry,
    writeThreadRegistry,
} from './thread-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const platformTools = resolvePlatformTools();
const gitExecutable = platformTools.git;
const nodeExecutable = process.execPath;
const pnpmExecutable = platformTools.pnpm;
const ghExecutable = platformTools.gh;

export function getShipIgnorePaths({ includeArtifacts = false } = {}) {
    return includeArtifacts ? ['.local'] : ['artifacts', '.local'];
}

function normalizePath(value) {
    return String(value ?? '').replaceAll('\\', '/').toLowerCase();
}

export function isMainModule({ argvPath, moduleUrl, platform = process.platform }) {
    if (!argvPath) {return false;}
    const pathApi = platform === 'win32' ? path.win32 : path.posix;
    const launchedPath = pathApi.resolve(argvPath);
    const sourcePath = fileURLToPath(moduleUrl, { windows: platform === 'win32' });
    return platform === 'win32' ? normalizePath(launchedPath) === normalizePath(sourcePath) : launchedPath === sourcePath;
}

function isIgnoredShipPath(filePath, ignorePaths = getShipIgnorePaths()) {
    const normalizedPath = normalizePath(filePath);
    return ignorePaths.some((ignorePath) => normalizedPath === normalizePath(ignorePath) || normalizedPath.startsWith(`${normalizePath(ignorePath)}/`));
}

export function parseGitStatusLines(statusText, ignorePaths = getShipIgnorePaths()) {
    return String(statusText ?? '').split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean)
        .map((line) => {
            const rawPath = line.slice(3).trim();
            return { code: line.slice(0, 2), path: rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) ?? rawPath : rawPath };
        }).filter((entry) => !isIgnoredShipPath(entry.path, ignorePaths));
}

export function parseWorktreeList(output) {
    const records = [];
    let record = null;
    for (const line of String(output ?? '').split(/\r?\n/)) {
        if (line === '') { if (record) {records.push(record);} record = null; }
        else if (line.startsWith('worktree ')) {record = { worktreePath: line.slice(9), branchRef: '' };}
        else if (line.startsWith('branch ') && record) {record.branchRef = line.slice(7);}
    }
    if (record) {records.push(record);}
    return records;
}

export function resolveMainWorktreePath(records) {
    const mainRecord = records.find((record) => record.branchRef === 'refs/heads/main');
    if (!mainRecord?.worktreePath) {throw new Error('Unable to locate the main worktree.');}
    return mainRecord.worktreePath;
}

export function getShipCommitMessage({ task, branch }) {
    return typeof task === 'string' && task.trim() ? `Finish thread: ${task.trim()}` : `Finish branch: ${branch}`;
}

export function getIntegrationStrategy({ hasOrigin, githubAvailable }) {
    if (hasOrigin && githubAvailable) {return 'github-pr';}
    if (!hasOrigin) {return 'local-only';}
    return 'blocked';
}

export function getGitHubMergeArgs(branch) {
    return ['pr', 'merge', branch, '--auto', '--merge'];
}

export function parsePullRequestMetadata(stdout) {
    const value = JSON.parse(String(stdout));
    return { number: value.number, state: value.state, head: value.headRefOid, base: value.baseRefOid };
}

function parseArgs(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        if (!argv[index].startsWith('--')) {continue;}
        const key = argv[index].slice(2);
        result[key] = argv[index + 1]?.startsWith('--') || !argv[index + 1] ? true : argv[++index];
    }
    return result;
}

function runOrThrow({ command, args, cwd, stdio = 'pipe' }) {
    const result = runCommandSync({ command, args, cwd, encoding: 'utf8', stdio });
    if ((result.status ?? 1) !== 0) {throw new Error(result.stderr?.trim() || `${command} ${args.join(' ')} failed.`);}
    return result;
}

function gitText(args, cwd) { return runOrThrow({ command: gitExecutable, args, cwd }).stdout.trim(); }
function git(args, cwd) { runOrThrow({ command: gitExecutable, args, cwd, stdio: 'inherit' }); }
function pnpm(args, cwd) { runOrThrow({ command: pnpmExecutable, args, cwd, stdio: 'inherit' }); }
function node(args, cwd) { runOrThrow({ command: nodeExecutable, args, cwd, stdio: 'inherit' }); }
function canRun(command, args, cwd) { return (runCommandSync({ command, args, cwd, encoding: 'utf8' }).status ?? 1) === 0; }

function getCurrentThreadEntry(cwd) {
    const registry = readThreadRegistry(resolveThreadRegistryPath(cwd));
    const snapshot = collectThreadSnapshot(cwd);
    return registry.entries.find((entry) => normalizePath(entry.cwd) === normalizePath(snapshot.cwd)) ?? null;
}

export function getShipMode(snapshot) { return snapshot.worktreeName === 'main' || snapshot.branch === 'main' ? 'main' : 'worktree'; }

function stageTaskChanges(cwd, ignorePaths) {
    git(['add', '-A', '--', '.'], cwd);
    const present = ignorePaths.filter((entry) => existsSync(path.join(cwd, entry)));
    if (present.length > 0) {git(['reset', 'HEAD', '--', ...present], cwd);}
}

function stopTaskRuntime(cwd) {
    node([path.join(workspaceRoot, 'tooling', 'scripts', 'repo', 'thread-dev-session.js'), 'stop'], cwd);
}

function commitCandidate({ cwd, entry, message, ignorePaths }) {
    stopTaskRuntime(cwd);
    stageTaskChanges(cwd, ignorePaths);
    const stagedFiles = gitText(['diff', '--cached', '--name-only', '--diff-filter=ACMRTUXB'], cwd).split(/\r?\n/).filter(Boolean);
    if (stagedFiles.length > 0) {
        pnpm(['run', 'qa:ready'], cwd);
        git(['commit', '-m', message], cwd);
    }
    return entry;
}

function getPullRequest(cwd, branch) {
    const result = runCommandSync({ command: ghExecutable, args: ['pr', 'view', branch, '--json', 'number,state,headRefOid,baseRefOid'], cwd, encoding: 'utf8' });
    return (result.status ?? 1) === 0 ? parsePullRequestMetadata(result.stdout) : null;
}

function ensureQueueLabel(cwd) {
    const existing = runCommandSync({ command: ghExecutable, args: ['label', 'list', '--limit', '100', '--json', 'name'], cwd, encoding: 'utf8' });
    if ((existing.status ?? 1) !== 0) {throw new Error(existing.stderr?.trim() || 'Unable to verify the repository merge queue label.');}
    if (JSON.parse(existing.stdout).some((label) => label.name === 'repository-merge-queued')) {return;}
    const created = runCommandSync({ command: ghExecutable, args: ['label', 'create', 'repository-merge-queued', '--description', 'Published task awaiting merge', '--color', '1D76DB'], cwd, encoding: 'utf8' });
    if ((created.status ?? 1) !== 0 && !/already exists/i.test(created.stderr ?? '')) {throw new Error(created.stderr?.trim() || 'Unable to create the repository merge queue label.');}
}

function publishPullRequest(cwd, branch, baseBranch, queueForMain) {
    git(['push', '--set-upstream', 'origin', branch], cwd);
    let pullRequest = getPullRequest(cwd, branch);
    if (!pullRequest) {runOrThrow({ command: ghExecutable, args: ['pr', 'create', '--fill', '--head', branch, '--base', baseBranch], cwd, stdio: 'inherit' });}
    pullRequest = getPullRequest(cwd, branch);
    if (!pullRequest || pullRequest.state !== 'OPEN') {throw new Error(`Unable to create or reuse an open pull request for ${branch}.`);}
    if (queueForMain) {
        ensureQueueLabel(cwd);
        runOrThrow({ command: ghExecutable, args: ['pr', 'edit', branch, '--add-label', 'repository-merge-queued'], cwd, stdio: 'inherit' });
        runOrThrow({ command: ghExecutable, args: getGitHubMergeArgs(branch), cwd, stdio: 'inherit' });
    }
    return pullRequest;
}

function recordPublication({ cwd, entry, pullRequest, publishedHead, baseSha, status }) {
    const registryPath = resolveThreadRegistryPath(cwd);
    const registry = readThreadRegistry(registryPath);
    const timestamp = new Date().toISOString();
    upsertThreadEntry(registry, {
        ...entry,
        ...collectThreadSnapshot(cwd),
        status,
        prNumber: pullRequest.number,
        publishedHead,
        baseSha,
        publishedAt: timestamp,
        remoteOwner: 'GitHub Actions',
        autoMergeState: status === 'merge-queued' ? 'armed' : 'not-required',
        expectedChecks: ['quality-gate'],
        localProcessesRemaining: 'none',
        latestFailure: null,
        latestCiResult: null,
        updatedAt: timestamp,
    });
    writeThreadRegistry(registryPath, registry);
}

function publishWorktree({ cwd, snapshot, message, ignorePaths }) {
    if (snapshot.detached || !snapshot.branch) {throw new Error('Cannot publish a detached checkout. Attach it to a task branch first.');}
    const entry = getCurrentThreadEntry(cwd);
    if (!entry) {throw new Error('Publishing requires a registered task worktree. Run thread:register first.');}
    if (entry.status === 'merged' || entry.status === 'discarded') {throw new Error(`Cannot publish a ${entry.status} task.`);}
    if (getIntegrationStrategy({ hasOrigin: canRun(gitExecutable, ['remote', 'get-url', 'origin'], cwd), githubAvailable: canRun(ghExecutable, ['auth', 'status'], cwd) }) !== 'github-pr') {
        throw new Error('Publishing requires origin and an authenticated GitHub CLI; the task was left intact.');
    }
    commitCandidate({ cwd, entry, message, ignorePaths });
    const publicationTarget = entry.publicationTarget || 'main';
    git(['fetch', 'origin', publicationTarget], cwd);
    git(['merge', '--no-edit', `origin/${publicationTarget}`], cwd);
    pnpm(['run', 'qa:merge'], cwd);
    const publishedHead = gitText(['rev-parse', 'HEAD'], cwd);
    const baseSha = gitText(['rev-parse', `origin/${publicationTarget}`], cwd);
    const queueForMain = entry.kind === 'integration' || publicationTarget === 'main';
    if (queueForMain) {ensureQueueLabel(cwd);}
    const pullRequest = publishPullRequest(cwd, snapshot.branch, publicationTarget, queueForMain);
    if (pullRequest.head !== publishedHead) {throw new Error('The remote pull request head does not match the published local candidate.');}
    recordPublication({ cwd, entry, pullRequest, publishedHead, baseSha, status: queueForMain ? 'merge-queued' : 'published' });
    console.log(`Published ${snapshot.branch} at ${publishedHead}; PR #${pullRequest.number} targets ${publicationTarget}. No GitHub checks were polled and local cleanup was deferred.`);
}

function main() {
    const cwd = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const snapshot = collectThreadSnapshot(cwd);
    if (getShipMode(snapshot) === 'main') {throw new Error('Publishing from main is refused; use a registered non-main task worktree.');}
    const entry = getCurrentThreadEntry(cwd);
    publishWorktree({
        cwd,
        snapshot,
        message: typeof args.message === 'string' && args.message.trim() ? args.message.trim() : getShipCommitMessage({ task: entry?.task ?? '', branch: snapshot.branch }),
        ignorePaths: getShipIgnorePaths({ includeArtifacts: args['include-artifacts'] === true }),
    });
}

if (isMainModule({ argvPath: process.argv[1], moduleUrl: import.meta.url })) {
    try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
}
