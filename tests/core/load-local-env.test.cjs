const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-local-env-'));
}

test('loadLocalEnvFile reads .env.local values without overwriting existing env', async () => {
    const tempDir = createTempDir();

    try {
        fs.writeFileSync(path.join(tempDir, '.env.local'), [
            '# comment',
            'GEMINI_API_KEY=AIzaSyLOCALKEY1234567890123456789012',
            'QUOTED_VALUE="hello world"',
            'KEEP_EXISTING=from-file',
            '',
        ].join('\n'));

        const { loadLocalEnvFile } = await import('../../src/entrypoints/core/loadLocalEnv.ts');
        const env = { KEEP_EXISTING: 'from-env' };
        const loadedPath = loadLocalEnvFile(tempDir, env);

        assert.equal(loadedPath, path.join(tempDir, '.env.local'));
        assert.equal(env.GEMINI_API_KEY, 'AIzaSyLOCALKEY1234567890123456789012');
        assert.equal(env.QUOTED_VALUE, 'hello world');
        assert.equal(env.KEEP_EXISTING, 'from-env');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
