#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolvePlatformTools } from './platform-tools.js';
import { runCommandSync } from './process-invocation.js';
import { collectThreadSnapshot, findThreadEntry, readThreadRegistry, resolveThreadRegistryPath, upsertThreadEntry, writeThreadRegistry } from './thread-state.js';
import { recoverInterruptedRuns } from './task-command-records.js';

const tools = resolvePlatformTools();
const [mode = 'status', ...rest] = process.argv.slice(2);
const argv = mode === 'resume' ? rest : process.argv.slice(2);
function parseArgs(tokens) {
    const parsed = {};
    for (let index = 0; index < tokens.length; index += 1) {
        if (!tokens[index].startsWith('--')) {continue;}
        const key = tokens[index].slice(2); const next = tokens[index + 1];
        parsed[key] = !next || next.startsWith('--') ? true : next;
        if (parsed[key] !== true) {index += 1;}
    }
    return parsed;
}
const args = parseArgs(argv);
function remote(prNumber, cwd) {
    if (!prNumber) {return null;}
    const result = runCommandSync({ command: tools.gh, args: ['pr', 'view', String(prNumber), '--json', 'state,headRefOid,baseRefOid,autoMergeRequest,statusCheckRollup'], cwd, encoding: 'utf8' });
    if ((result.status ?? 1) !== 0) {return null;}
    try {return JSON.parse(result.stdout || 'null');} catch {return null;}
}
function checksFrom(remoteState) {
    const checks = remoteState && typeof remoteState === 'object' ? remoteState.statusCheckRollup : undefined;
    return Array.isArray(checks) ? checks : [];
}
function failedCheck(check) { return check && typeof check === 'object' && ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(check.conclusion); }
function classify(entry, remoteState) {
    if ((entry.publishedHead && entry.includedInMain) || remoteState?.state === 'MERGED') {return 'DONE';}
    if (entry.latestFailure && entry.publishedHead && entry.latestFailure.candidateCommit === entry.publishedHead) {return 'FAILED';}
    const checks = checksFrom(remoteState);
    const failed = checks.find(failedCheck);
    if (failed && remoteState?.headRefOid === entry.publishedHead) {return 'FAILED';}
    if (entry.publishedHead && remoteState?.state === 'OPEN' && remoteState.headRefOid === entry.publishedHead && remoteState.autoMergeRequest) {return 'WAITING ON CI';}
    return 'ACTION NEEDED';
}
function render(result, entry, remoteState) {
    const failure = getFailure(entry, remoteState);
    const detail = getDetail(result, entry, failure);
    if (args.json) {console.log(JSON.stringify({ result, task: entry, remote: remoteState, failure }, null, 2)); return;}
    const needsAction = result === 'ACTION NEEDED' ? 'Yes' : 'No';
    if (args.verbose) {console.log(`${result}\n${detail}\n${JSON.stringify({ task: entry, remote: remoteState }, null, 2)}\nDo you need to do anything: ${needsAction}`); return;}
    console.log(`${result}\n${detail}\nDo you need to do anything: ${needsAction}`);
}
function getFailure(entry, remoteState) {
    if (entry.latestFailure && entry.publishedHead && entry.latestFailure.candidateCommit === entry.publishedHead) {return typeof entry.latestFailure.message === 'string' ? entry.latestFailure.message : undefined;}
    return checksFrom(remoteState).find((check) => failedCheck(check))?.name;
}
function getDetail(result, entry, failure) {
    if (result === 'DONE') {return 'The code passed all checks and has merged into main. Nothing else is required.';}
    if (result === 'WAITING ON CI') {return `The code passed local checks and is with GitHub as PR #${entry.prNumber}. No local processes remain. GitHub now owns the checks and will notify you.`;}
    if (result === 'FAILED') {return `CI or local validation failed: ${failure ?? 'see the stored task failure packet'}. The task worktree is safe to resume.`;}
    return 'This task needs attention before it can continue. Review the stored task capsule and resume it safely.';
}
function main() {
    const cwd = process.cwd(); const registryPath = resolveThreadRegistryPath(cwd); const registry = readThreadRegistry(registryPath);
    const entry = findThreadEntry(registry, args.task ? { task: args.task } : { cwd });
    if (!entry) {throw new Error('No registered task was found.');}
    recoverInterruptedRuns(entry); const snapshot = existsSync(entry.cwd) ? collectThreadSnapshot(entry.cwd) : null;
    if (snapshot) {Object.assign(entry, snapshot);}
    const remoteState = remote(entry.prNumber, entry.cwd);
    const result = classify(entry, remoteState);
    entry.latestCiResult = { result, at: new Date().toISOString(), head: remoteState?.headRefOid ?? entry.publishedHead ?? '' };
    if (result === 'DONE') {entry.status = 'merged'; entry.includedInMain = true; entry.cleanupState = 'deferred-safe';}
    upsertThreadEntry(registry, entry); writeThreadRegistry(registryPath, registry);
    if (mode === 'resume') {
        const next = getRecommendedAction(result);
        const capsule = { objective: entry.objective || entry.task, acceptanceCriteria: entry.acceptanceCriteria || [], worktree: entry.cwd, branch: entry.branch, publicationTarget: entry.publicationTarget, lifecycle: entry.status, dirty: entry.dirty, prNumber: entry.prNumber, publishedHead: entry.publishedHead, latestFailure: entry.latestFailure, recommendedNextAction: next };
        console.log(args.json ? JSON.stringify(capsule, null, 2) : `${entry.task}\n${entry.objective || entry.task}\nRecommended next action: ${next}`); return;
    }
    render(result, entry, remoteState);
}
function getRecommendedAction(result) {
    if (result === 'FAILED') {return 'Resume this task and fix the stored failure.';}
    if (result === 'WAITING ON CI') {return 'No action; GitHub owns the current checks.';}
    if (result === 'DONE') {return 'No action required.';}
    return 'Resolve the stored task blocker, then finish this task again.';
}
if (process.argv[1]?.endsWith('task-status.js')) { try {main();} catch (error) {console.log(`FAILED\nLifecycle status failed: ${error instanceof Error ? error.message : String(error)}\nDo you need to do anything: No`); process.exitCode = 1;} }
export { checksFrom, classify, getDetail, getFailure, render };
