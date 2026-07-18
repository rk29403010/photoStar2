import { existsSync } from 'node:fs';
import os from 'node:os';
import { resolveDevRuntimePorts } from './dev-runtime-config.js';
import { runCommandSync } from './process-invocation.js';

const { webPort, backendPort } = resolveDevRuntimePorts(process.env);
const ports = [webPort, backendPort];

function clearStartupOutput() {
    if (!process.stdout.isTTY && !process.stderr.isTTY) {
        return;
    }

    const clearSequence = '\x1Bc';
    try {
        process.stdout.write(clearSequence);
        process.stderr.write(clearSequence);
        console.clear();
    } catch (error) {
        console.warn(`[Cleanup] Terminal clearing is unavailable: ${error.message}`);
    }
}

function killWindowsPortOwners(targetPorts) {
    const result = runCommandSync({
        command: 'powershell.exe',
        args: [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '$ports = $env:PHOTOSTAR_DEV_PORTS -split ","; $pids = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($pids) { Stop-Process -Id $pids -Force -ErrorAction SilentlyContinue }',
        ],
        env: {
            ...process.env,
            PHOTOSTAR_DEV_PORTS: targetPorts.join(','),
        },
        stdio: 'ignore',
    });
    return result.status ?? 1;
}

function findUnixPortOwners(targetPorts) {
    const lsofExecutable = ['/usr/sbin/lsof', '/usr/bin/lsof'].find((candidate) => existsSync(candidate));
    if (!lsofExecutable) {
        return new Set();
    }

    const owners = new Set();
    for (const port of targetPorts) {
        const result = runCommandSync({
            command: lsofExecutable,
            args: ['-t', `-i:${port}`],
            encoding: 'utf8',
        });
        if ((result.status ?? 1) !== 0) {
            continue;
        }

        for (const line of String(result.stdout ?? '').split(/\r?\n/)) {
            const pid = Number.parseInt(line.trim(), 10);
            if (Number.isInteger(pid)) {
                owners.add(pid);
            }
        }
    }
    return owners;
}

function killUnixPortOwners(targetPorts) {
    for (const pid of findUnixPortOwners(targetPorts)) {
        try {
            process.kill(pid, 'SIGKILL');
        } catch (error) {
            if (error.code !== 'ESRCH') {
                throw error;
            }
        }
    }
}

clearStartupOutput();
console.log(`[Cleanup] Fast-killing ports ${ports.join(', ')}...`);

if (os.platform() === 'win32') {
    killWindowsPortOwners(ports);
} else {
    killUnixPortOwners(ports);
}
