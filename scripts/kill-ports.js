import { execSync } from 'child_process';
import os from 'os';

const ports = [5173, 5174];

console.log(`[Cleanup] Fast-killing ports ${ports.join(', ')}...`);

try {
    if (os.platform() === 'win32') {
        const portStr = ports.join(',');
        execSync(`powershell -NoProfile -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort ${portStr} -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue"`, { stdio: 'ignore' });
    } else {
        execSync(`lsof -ti:${ports.join(',')} | xargs -r kill -9`, { stdio: 'ignore' });
    }
} catch (e) {
    // It's perfectly fine if it throws (e.g. no processes found)
}
