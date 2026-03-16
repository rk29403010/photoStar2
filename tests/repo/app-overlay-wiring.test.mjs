import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('App renders a single overlay shell and keeps workflow visualiser wiring', () => {
    const appSource = readFileSync(path.join(workspaceRoot, 'src/ui/App.tsx'), 'utf8');
    const overlayMatches = appSource.match(/<AppOverlays\b/g) ?? [];

    assert.equal(overlayMatches.length, 1);
    assert.match(appSource, /onOpenWorkflowVisualiser=\{\(\) => setView\('workflows'\)\}/);
});
