import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('browser dev backend origin uses IPv4 loopback when Vite is served from localhost', () => {
    const backendRuntimeSource = readFileSync('src/boundary/runtime/backend.ts', 'utf8');

    assert.match(backendRuntimeSource, /host === 'localhost'/);
    assert.match(backendRuntimeSource, /return '127\.0\.0\.1'/);
});
