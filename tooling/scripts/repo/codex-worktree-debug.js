#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDevRuntimePorts } from './dev-runtime-config.js';
import { runCommandSync } from './process-invocation.js';
import { resolveCodexActionWorktree } from './codex-worktree-target.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runCodexDebugAction({
    cwd = process.cwd(),
    environment = process.env,
    runCommand = runCommandSync,
} = {}) {
    const targetPath = resolveCodexActionWorktree({ cwd, environment });
    console.log(`[codex-debug] Target worktree: ${targetPath}`);
    console.log('[codex-debug] Starting managed desktop runtime...');

    const result = runCommand({
        command: process.execPath,
        // The action itself is launched from the primary checkout.  The runtime
        // manager must come from the resolved task worktree, otherwise its
        // module-relative workspace root silently starts the primary checkout.
        args: [path.join(targetPath, 'tooling', 'scripts', 'repo', 'thread-dev-session.js'), '--script', 'dev:desktop-runtime:debug'],
        cwd: targetPath,
        stdio: 'inherit',
    });
    if ((result.status ?? 1) !== 0) {
        throw new Error(`Debug runtime failed to start (exit ${result.status ?? 'unknown'}). Run the Environment Doctor action for details.`);
    }

    const { webPort, backendPort } = resolveDevRuntimePorts(environment, targetPath);
    console.log(`Debug URL: http://localhost:${webPort}`);
    console.log(`backend:${backendPort}`);
    return { targetPath, webPort, backendPort };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        runCodexDebugAction();
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[codex-debug] ${detail}`);
        process.exitCode = 1;
    }
}
