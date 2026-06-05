import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('workflow workspace header keeps controls while removing redundant explanatory chrome', () => {
    const headerSource = readFileSync('src/ui/components/workflows/WorkflowWorkspaceHeader.tsx', 'utf8');

    assert.doesNotMatch(headerSource, />Workflow Visualiser</);
    assert.doesNotMatch(headerSource, /model\.displayName/);
    assert.doesNotMatch(headerSource, /model\.tabs\.overview\.summary\.description/);
    assert.doesNotMatch(headerSource, />Workflow\s*</);
    assert.doesNotMatch(headerSource, />Run Context</);
    assert.doesNotMatch(headerSource, /props\.model\.selectedRun \?/);
    assert.doesNotMatch(headerSource, /rounded-xl border border-gray-800/);
    assert.match(headerSource, /<[Ss]elect[\s\S]*props\.selectedWorkflowId/);
    assert.match(headerSource, /<[Ss]elect[\s\S]*props\.selectedRunValue/);
});
