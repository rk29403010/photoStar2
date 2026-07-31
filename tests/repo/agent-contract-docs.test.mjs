import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

async function readRepositoryFile(relativePath) {
    return readFile(path.join(workspaceRoot, relativePath), 'utf8');
}

test('authoritative agent documentation retains the task lifecycle vocabulary', async () => {
    const [agents, workflow, projectMap, adr, playbook, progressiveDeliveryAdr] = await Promise.all([
        readRepositoryFile('AGENTS.md'),
        readRepositoryFile('docs/ai/change-workflow.md'),
        readRepositoryFile('docs/ai/AI_PROJECT_MAP.md'),
        readRepositoryFile('docs/architecture/adr-003-deterministic-plugin-registration.md'),
        readRepositoryFile('docs/ai/feature-delivery-playbook.md'),
        readRepositoryFile('docs/architecture/adr-005-progressive-feature-delivery-and-ui-smoke.md'),
    ]);

    for (const term of [
        'task capsule',
        'host',
        'plug-in',
        'extension contract',
        'machine-owned registry',
        'leaf task',
        'integration task',
        'published',
        'merge-queued',
        'merged',
        'cleanup-pending',
        'blocked',
    ]) {
        assert.match(workflow, new RegExp(`\\*\\*${term}[^*]*\\*\\*`, 'i'));
    }

    assert.match(agents, /task capsule/i);
    assert.match(agents, /machine-owned registry/i);
    assert.match(projectMap, /merge-queued/i);
    assert.match(projectMap, /plug-ins/i);
    assert.match(adr, /deterministic plug-in registration/i);
    assert.match(agents, /Progressive Feature Delivery/i);
    assert.match(workflow, /Progressive feature delivery/i);
    assert.match(playbook, /Low-reasoning agents/i);
    assert.match(progressiveDeliveryAdr, /browser boot smoke/i);
});
