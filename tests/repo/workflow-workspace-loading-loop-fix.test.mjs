import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('workflow workspace polling does not restart loading when the callback identity changes', () => {
    const workflowWorkspaceSource = fs.readFileSync('src/ui/components/workflows/WorkflowWorkspace.tsx', 'utf8');

    assert.match(
        workflowWorkspaceSource,
        /const loadWorkflowVisualiser = useEffectEvent\(async \(\s*nextWorkflowId: string,\s*nextSelectedRunId: string \| null,\s*onLoaded: \(nextModel: WorkflowVisualiserModel\) => void,\s*onFailed: \(nextError: unknown\) => void,\s*\) => \{/s,
    );
    assert.match(
        workflowWorkspaceSource,
        /useEffect\(\(\) => \{\s*let cancelled = false;\s*let timeoutId: ReturnType<typeof setTimeout> \| null = null;/s,
    );
    assert.match(
        workflowWorkspaceSource,
        /void loadWorkflowVisualiser\(\s*workflowId,\s*selectedRunId,\s*\(nextModel\) => \{[\s\S]*?\(nextError: unknown\) => \{/s,
    );
    assert.match(
        workflowWorkspaceSource,
        /}, \[selectedRunId, workflowId]\);/s,
    );
    assert.doesNotMatch(
        workflowWorkspaceSource,
        /}, \[onGetWorkflowVisualiser, selectedRunId, workflowId]\);/s,
    );
});
