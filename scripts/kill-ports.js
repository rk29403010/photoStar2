import { execSync } from 'child_process';
import os from 'os';

const ports = [5173, 5174];

function clearStartupOutput() {
    if (!process.stdout.isTTY && !process.stderr.isTTY) {
        return;
    }

    const clearSequence = '\x1Bc';
    try {
        process.stdout.write(clearSequence);
        process.stderr.write(clearSequence);
        console.clear();
    } catch {
        // Ignore environments that do not support terminal clearing.
    }
}

clearStartupOutput();
console.log(`[Cleanup] Fast-killing ports ${ports.join(', ')}...`);

try {
    if (os.platform() === 'win32') {
        const portList = ports.join(',');
        execSync(
            `powershell -NoProfile -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort ${portList} -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue"`,
            { stdio: 'ignore' }
        );
    } else {
        execSync(`lsof -ti:${ports.join(',')} | xargs -r kill -9`, { stdio: 'ignore' });
    }
} catch {
    // It is fine when no previous processes are holding those ports.
}
