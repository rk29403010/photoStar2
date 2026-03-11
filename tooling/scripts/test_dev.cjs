const { spawn } = require('child_process');
const path = require('path');

// Target the compiled core entrypoint directly (simulating debug_sidecar.bat)
const corePath = path.join(__dirname, '..', '..', 'dist', 'core', 'src', 'entrypoints', 'core', 'main.js');
console.log('[TEST-DEV] Spawning sidecar at:', corePath);

const child = spawn('node', [corePath], {
    stdio: ['pipe', 'pipe', 'pipe'], // Capture stderr too
    cwd: __dirname
});

child.stdout.on('data', (data) => {
    const str = data.toString();
    console.log('[SIDECAR-OUT]', str.trim());

    if (str.includes('Core sidecar started')) {
        console.log('[TEST-DEV] Sending detect_faces command...');
        const command = JSON.stringify({
            id: 'test-dev-1',
            command: 'detect_faces',
            payload: {}
        });
        child.stdin.write(command + '\n');
    }

    if (str.includes('"status":"complete"')) {
        console.log('[TEST-DEV] Job completed!');
        child.stdin.end();
        process.exit(0);
    }
});

child.stderr.on('data', (data) => {
    console.log('[SIDECAR-ERR]', data.toString().trim());
});

console.log('[TEST-DEV] Waiting for output...');

setTimeout(() => {
    console.log('[TEST-DEV] Timeout reached (30s)');
    child.kill();
}, 30000); // 30 seconds

