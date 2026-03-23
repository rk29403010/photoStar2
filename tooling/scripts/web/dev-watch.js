#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const viteBinPath = path.resolve(workspaceRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const WEB_WATCH_PREFIX = '\x1b[36m[web-watch]\x1b[0m';

function formatPrefixedLine(line) {
    if (line.length === 0) {
        return '\n';
    }

    return `${WEB_WATCH_PREFIX} ${line}\n`;
}

export function createPrefixedOutputHandler({ write }) {
    let buffer = '';

    return (chunk) => {
        buffer += chunk.toString();

        let lineBreakIndex = buffer.indexOf('\n');
        while (lineBreakIndex !== -1) {
            const line = buffer.slice(0, lineBreakIndex);
            buffer = buffer.slice(lineBreakIndex + 1);
            write(formatPrefixedLine(line));
            lineBreakIndex = buffer.indexOf('\n');
        }
    };
}

function spawnVite(cliArgs = process.argv.slice(2)) {
    const child = spawn(process.execPath, [viteBinPath, ...cliArgs], {
        cwd: workspaceRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: process.platform === 'win32',
    });

    child.stdout.on('data', createPrefixedOutputHandler({
        write: (text) => process.stdout.write(text),
    }));
    child.stderr.on('data', createPrefixedOutputHandler({
        write: (text) => process.stderr.write(text),
    }));

    child.on('error', (error) => {
        console.error(`${WEB_WATCH_PREFIX} failed to start Vite:`, error);
        process.exit(1);
    });

    child.on('exit', (code, signal) => {
        if (signal) {
            process.kill(process.pid, signal);
            return;
        }

        process.exit(code ?? 0);
    });

    return child;
}

function main() {
    const child = spawnVite();

    function shutdown(signal) {
        child.kill(signal);
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
