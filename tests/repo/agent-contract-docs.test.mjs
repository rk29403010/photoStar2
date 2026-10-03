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

test('root agent instructions stay compact and delegate specialised policy', async () => {
    const [agents, uiAgents, photoEditingAgents, workflowAgents] = await Promise.all([
        readRepositoryFile('AGENTS.md'),
        readRepositoryFile('src/ui/AGENTS.md'),
        readRepositoryFile('src/services/photoEditing/AGENTS.md'),
        readRepositoryFile('src/services/workflowRuntime/AGENTS.md'),
    ]);

    assert.ok(agents.split(/\r?\n/u).length <= 180, 'root AGENTS.md should remain cheap global context');
    assert.match(agents, /Codex may use its native worktree/i);
    assert.match(agents, /machine-owned registry/i);
    assert.match(agents, /qa:quick/i);
    assert.match(agents, /qa:ready/i);
    assert.match(agents, /qa:merge/i);
    assert.match(agents, /1200 lines/i);
    assert.match(agents, /src\/ui\/AGENTS\.md/u);
    assert.match(uiAgents, /semantic theme tokens/i);
    assert.match(photoEditingAgents, /non-destructive/i);
    assert.match(workflowAgents, /self-contained and self-describing/i);
});

test('advanced coordination vocabulary remains in the opt-in workflow guide', async () => {
    const [workflow, projectMap, adr, playbook, progressiveDeliveryAdr] = await Promise.all([
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

    assert.match(projectMap, /merge-queued/i);
    assert.match(projectMap, /plug-ins/i);
    assert.match(adr, /deterministic plug-in registration/i);
    assert.match(playbook, /Low-reasoning agents/i);
    assert.match(progressiveDeliveryAdr, /browser boot smoke/i);
});
