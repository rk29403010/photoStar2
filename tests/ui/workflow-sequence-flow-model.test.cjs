const test = require('node:test');
const assert = require('node:assert/strict');

test('sequence flow edges bind to explicit workflow node handles', async () => {
    const {
        SEQUENCE_NODE_BOTTOM_HANDLE_ID,
        SEQUENCE_NODE_LEFT_HANDLE_ID,
        SEQUENCE_NODE_TOP_HANDLE_ID,
        buildWorkflowSequenceFlowEdges,
    } = await import('../../src/ui/components/workflows/workflowSequenceFlowModel.ts');

    const edges = buildWorkflowSequenceFlowEdges([
        { id: 'generate-face-vectors->collect-people', source: 'generate-face-vectors', target: 'collect-people' },
        { id: 'scan-folder->preview-each', source: 'scan-folder', target: 'preview-each' },
    ], {
        'generate-face-vectors': 'enrichment',
        'collect-people': 'enrichment',
        'scan-folder': 'discovery',
        'preview-each': 'library-ready',
    });

    assert.deepEqual(edges, [
        {
            id: 'generate-face-vectors->collect-people',
            source: 'generate-face-vectors',
            target: 'collect-people',
            type: 'workflowEdge',
            sourceHandle: SEQUENCE_NODE_BOTTOM_HANDLE_ID,
            targetHandle: SEQUENCE_NODE_TOP_HANDLE_ID,
            animated: false,
            selectable: false,
            markerEnd: { type: 'arrowclosed', width: 18, height: 18, color: '#4b5563' },
            style: {
                stroke: '#4b5563',
                strokeWidth: 4,
            },
            data: undefined,
        },
        {
            id: 'scan-folder->preview-each',
            source: 'scan-folder',
            target: 'preview-each',
            type: 'workflowEdge',
            sourceHandle: SEQUENCE_NODE_BOTTOM_HANDLE_ID,
            targetHandle: SEQUENCE_NODE_LEFT_HANDLE_ID,
            animated: false,
            selectable: false,
            markerEnd: { type: 'arrowclosed', width: 18, height: 18, color: '#4b5563' },
            style: {
                stroke: '#4b5563',
                strokeWidth: 4,
            },
            data: {
                clearanceY: 32,
                gapX: 0,
            },
        },
    ]);
});
