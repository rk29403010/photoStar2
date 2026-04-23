import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();

test('ai metadata studio pack script includes Repomix guidance and the prompt/schema targets', () => {
    const source = readFileSync(path.join(workspaceRoot, 'tooling', 'scripts', 'repo', 'ai-metadata-studio-pack.mjs'), 'utf8');

    assert.match(source, /repomix files/);
    assert.match(source, /src\/services\/aiMetadata\/geminiPrompts\.ts/);
    assert.match(source, /src\/services\/aiMetadata\/geminiResponseSchema\.ts/);
    assert.match(source, /tooling\/scripts\/repo\/ai-metadata-debug\.mjs/);
});
