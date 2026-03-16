const test = require('node:test');
const assert = require('node:assert/strict');

test('workflow workspace exposes the approved tab order and overview as the default tab', async () => {
    const {
        WORKFLOW_DEFINITION_ONLY_RUN_ID,
        WORKFLOW_WORKSPACE_TABS,
        getDefaultWorkflowWorkspaceTab,
        getWorkflowVisualiserRequestedRunId,
        getWorkflowWorkspaceRunSelectionValue,
        shouldFitSequenceMapViewport,
        tabSupportsInspector,
    } = await import('../../src/ui/components/workflows/workflowWorkspaceModel.ts');

    assert.deepEqual(
        WORKFLOW_WORKSPACE_TABS.map((tab) => tab.id),
        ['overview', 'progression', 'graph', 'sequence', 'text'],
    );
    assert.equal(getDefaultWorkflowWorkspaceTab(), 'overview');
    assert.equal(tabSupportsInspector('overview'), false);
    assert.equal(tabSupportsInspector('progression'), true);
    assert.equal(tabSupportsInspector('graph'), true);
    assert.equal(tabSupportsInspector('sequence'), true);
    assert.equal(tabSupportsInspector('text'), false);
    assert.equal(getWorkflowVisualiserRequestedRunId(null), undefined);
    assert.equal(getWorkflowVisualiserRequestedRunId(WORKFLOW_DEFINITION_ONLY_RUN_ID), null);
    assert.equal(getWorkflowVisualiserRequestedRunId('run-42'), 'run-42');
    assert.equal(getWorkflowWorkspaceRunSelectionValue(null, 'run-42'), 'run-42');
    assert.equal(getWorkflowWorkspaceRunSelectionValue(WORKFLOW_DEFINITION_ONLY_RUN_ID, 'run-42'), WORKFLOW_DEFINITION_ONLY_RUN_ID);
    assert.equal(getWorkflowWorkspaceRunSelectionValue(null, null), '');
    assert.equal(shouldFitSequenceMapViewport(null), true);
    assert.equal(shouldFitSequenceMapViewport({ x: 10, y: 20, zoom: 0.9 }), false);
});

test('getWorkflowDetail returns the matching stage or node detail for the current selection', async () => {
    const { getWorkflowDetail } = await import('../../src/ui/components/workflows/workflowWorkspaceModel.ts');

    const detail = getWorkflowDetail({
        details: [
            {
                id: 'library-ready',
                label: 'Library Ready',
                description: 'Prepare previews.',
                kind: 'stage',
                status: 'running',
                upstreamIds: [],
                downstreamIds: [],
                counts: { totalItems: 10, completedItems: 4, failedItems: 0 },
            },
            {
                id: 'scan-folder',
                label: 'Scan Folder',
                description: 'Discover files.',
                kind: 'module',
                status: 'completed',
                upstreamIds: [],
                downstreamIds: ['preview-each'],
                counts: { totalItems: 10, completedItems: 10, failedItems: 0 },
            },
        ],
    }, 'scan-folder');

    assert.equal(detail?.label, 'Scan Folder');
    assert.equal(detail?.kind, 'module');
});
