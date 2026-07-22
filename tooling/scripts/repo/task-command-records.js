import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function taskLogPaths(cwd, commandId) {
    const directory = path.join(cwd, '.local', 'task-runs');
    mkdirSync(directory, { recursive: true });
    return { stdoutLog: path.join(directory, `${commandId}.out.log`), stderrLog: path.join(directory, `${commandId}.err.log`) };
}

export async function runTrackedCommand({ command, args, cwd, candidateCommit, entry, save }) {
    const live = (entry.commandRuns ?? []).find((run) => run.state === 'running' && run.pid && (() => { try { process.kill(run.pid, 0); return true; } catch { return false; } })());
    if (live) {throw new Error(`A recorded task command is still running (${live.commandId}).`);}
    const commandId = `${Date.now()}-${process.pid}-${(entry.commandRuns ?? []).length}`;
    const logs = taskLogPaths(cwd, commandId);
    const record = { commandId, command, args, pid: null, startedAt: new Date().toISOString(), state: 'running', exitCode: null, candidateCommit, ...logs };
    entry.commandRuns = [...(entry.commandRuns ?? []).filter((run) => run.state !== 'running'), record];
    save(entry);
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        record.pid = child.pid ?? null;
        save(entry);
        child.stdout.pipe(createWriteStream(logs.stdoutLog));
        child.stderr.pipe(createWriteStream(logs.stderrLog));
        child.once('error', (error) => { record.state = 'failed'; record.finishedAt = new Date().toISOString(); record.exitCode = 1; save(entry); reject(error); });
        child.once('close', (code, signal) => {
            record.finishedAt = new Date().toISOString(); record.exitCode = code;
            record.state = signal ? 'interrupted' : getExitState(code);
            save(entry);
            if (code === 0 && !signal) {resolve(record);} else {reject(new Error(`Command failed (${record.state}). See ${logs.stderrLog}`));}
        });
    });
}

function getExitState(code) { return code === 0 ? 'passed' : 'failed'; }

export function recoverInterruptedRuns(entry, isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } }) {
    for (const record of entry.commandRuns ?? []) {
        if (record.state === 'running' && !isAlive(record.pid)) { record.state = 'interrupted'; record.finishedAt = new Date().toISOString(); }
    }
    return entry;
}
