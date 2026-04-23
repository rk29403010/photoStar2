import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();

test('ai metadata bundle script includes the existing debug runner command in its README template', () => {
    const source = readFileSync(path.join(workspaceRoot, 'tooling', 'scripts', 'repo', 'ai-metadata-bundle.mjs'), 'utf8');

    assert.match(source, /npm\.cmd run ai-metadata:debug -- --asset=<asset-id-or-path-fragment>/);
    assert.match(source, /external-packages\.json/);
    assert.match(source, /files\/tooling\/scripts\/repo\/ai-metadata-debug\.mjs/);
});
