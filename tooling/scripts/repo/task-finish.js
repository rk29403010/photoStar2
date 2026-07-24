#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTrackedCommand, recoverInterruptedRuns } from './task-command-records.js';
import { collectThreadSnapshot, findThreadEntry, readThreadRegistry, resolveThreadRegistryPath, upsertThreadEntry, writeThreadRegistry } from './thread-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = Object.fromEntries(process.argv.slice(2).filter((item) => item.startsWith('--')).map((item) => [item.slice(2), true]));
function saveFactory(registry, registryPath) {
    return (entry) => {
        const latest = readThreadRegistry(registryPath);
        const existing = findThreadEntry(latest, { cwd: entry.cwd });
        upsertThreadEntry(latest, { ...entry, ...existing, commandRuns: entry.commandRuns, updatedAt: new Date().toISOString() });
        registry.entries = latest.entries;
        writeThreadRegistry(registryPath, latest);
    };
}
function human(result, detail, json) { const payload = { result, detail, doYouNeedToDoAnything: result === 'ACTION NEEDED', reconstructed: true }; if (json) {console.log(JSON.stringify(payload, null, 2));} else {console.log(`${result}\n${detail}\nDo you need to do anything: ${payload.doYouNeedToDoAnything ? 'Yes' : 'No'}`);} }
function isAuthError(error) { return /auth|login|credential/i.test(String(error)); }
async function main() {
    const cwd = process.cwd(); const registryPath = resolveThreadRegistryPath(cwd); const registry = readThreadRegistry(registryPath); const snapshot = collectThreadSnapshot(cwd);
    const entry = findThreadEntry(registry, { cwd });
    if (!entry || snapshot.branch === 'main') {throw new Error('task:finish must run from a registered non-main task worktree.');}
    recoverInterruptedRuns(entry); const save = saveFactory(registry, registryPath); save(entry);
    const shipScript = path.join(root, 'tooling', 'scripts', 'repo', 'thread-ship.js');
    try {
        await runTrackedCommand({ command: process.execPath, args: [shipScript], cwd, candidateCommit: snapshot.lastCommit, entry, save });
        const refreshed = findThreadEntry(registry, { cwd });
        if (refreshed?.running !== 'none') {throw new Error('A task-owned local process remains.');}
        human('WAITING ON CI', `The code passed local checks and was handed to GitHub as PR #${refreshed.prNumber}.\nNo local processes remain. GitHub now owns the checks and will notify you. You do not need to do anything.\nLater status can be reconstructed after a restart.`, args.json);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // The registry may have been rewritten by an interrupted command. Retain
        // the original error even when no refreshed entry can be found.
        const current = findThreadEntry(registry, { cwd }) ?? entry;
        current.latestFailure = { message, at: new Date().toISOString(), candidateCommit: current.lastCommit ?? snapshot.lastCommit };
        save(current);
        human(isAuthError(message) ? 'ACTION NEEDED' : 'FAILED', isAuthError(message) ? 'GitHub authentication has expired. Sign in to GitHub, then ask Codex to finish the task again.' : `Local validation or publication failed: ${message}\nThe task remains safe and no background process remains. Codex can continue fixing it in this task.`, args.json);
        process.exitCode = 1;
    }
}
if (process.argv[1]?.endsWith('task-finish.js')) { main().catch((error) => { human('FAILED', `Lifecycle finish failed: ${error instanceof Error ? error.message : String(error)}`, args.json); process.exitCode = 1; }); }
export { human };
