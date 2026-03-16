const test = require('node:test');
const assert = require('node:assert/strict');

test('sequence flow edges bind to explicit workflow node handles', async () => {
    const {
        SEQUENCE_NODE_BOTTOM_HANDLE_ID,
        SEQUENCE_NODE_LEFT_HANDLE_ID,
        SEQUENCE_NODE_RIGHT_HANDLE_ID,
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
            sourceHandle: SEQUENCE_NODE_BOTTOM_HANDLE_ID,
            targetHandle: SEQUENCE_NODE_TOP_HANDLE_ID,
            animated: false,
            selectable: false,
            markerEnd: { type: 'arrowclosed', width: 20, height: 20, color: '#67e8f9' },
            style: {
                stroke: '#67e8f9',
                strokeWidth: 2,
            },
        },
        {
            id: 'scan-folder->preview-each',
            source: 'scan-folder',
            target: 'preview-each',
            sourceHandle: SEQUENCE_NODE_RIGHT_HANDLE_ID,
            targetHandle: SEQUENCE_NODE_LEFT_HANDLE_ID,
            animated: false,
            selectable: false,
            markerEnd: { type: 'arrowclosed', width: 20, height: 20, color: '#67e8f9' },
            style: {
                stroke: '#67e8f9',
                strokeWidth: 2,
            },
        },
    ]);
});
