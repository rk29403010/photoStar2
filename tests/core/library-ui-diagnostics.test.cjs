const test = require('node:test');
const assert = require('node:assert/strict');

test('appendUiFeedEntry keeps only the newest diagnostics entries', async () => {
    const { appendUiFeedEntry } = await import('../../dist/core/src/shared/utils/libraryUiDiagnostics.js');

    const entries = [
        { id: '1', timestamp: '2026-03-14T10:00:00.000Z', source: 'event', label: 'one', detail: 'first' },
        { id: '2', timestamp: '2026-03-14T10:00:01.000Z', source: 'event', label: 'two', detail: 'second' },
    ];

    const nextEntries = appendUiFeedEntry(entries, {
        id: '3',
        timestamp: '2026-03-14T10:00:02.000Z',
        source: 'workflow_poll',
        label: 'three',
        detail: 'third',
    }, 2);

    assert.deepEqual(nextEntries.map((entry) => entry.id), ['2', '3']);
});

test('buildIngestStatusMessage uses preview progress from workflow detail', async () => {
    const { buildIngestStatusMessage, buildWorkflowPollDetail } = await import('../../dist/core/src/shared/utils/libraryUiDiagnostics.js');

    const detail = {
        summary: { status: 'running' },
        steps: [
            { nodeId: 'scan-folder', status: 'succeeded', totalItems: 400, completedItems: 400 },
            { nodeId: 'generate-previews', status: 'running', totalItems: 400, completedItems: 84 },
        ],
    };

    assert.equal(buildIngestStatusMessage(detail), 'Generating thumbnails 84/400');
    assert.equal(buildWorkflowPollDetail(detail), 'run=running; previews=84/400; step=running');
});

test('buildIngestStatusMessage falls back to scanning when preview step is missing', async () => {
    const { buildIngestStatusMessage } = await import('../../dist/core/src/shared/utils/libraryUiDiagnostics.js');

    assert.equal(buildIngestStatusMessage({ summary: { status: 'running' }, steps: [] }), 'Scanning folder...');
    assert.equal(buildIngestStatusMessage({ summary: { status: 'completed' }, steps: [] }), null);
});

test('formatUiFeedEntriesForClipboard emits a tabular export', async () => {
    const { formatUiFeedEntriesForClipboard } = await import('../../dist/core/src/shared/utils/libraryUiDiagnostics.js');

    const exported = formatUiFeedEntriesForClipboard([
        {
            id: 'asset-1',
            timestamp: '2026-03-14T10:00:00.000Z',
            source: 'asset_response',
            label: 'Assets refresh response',
            detail: 'incoming=20; incomingPreviews=5',
            requestId: 'get_assets-1',
            assetCount: 20,
            previewCount: 5,
            previousAssetCount: 10,
            nextAssetCount: 20,
            applied: true,
        },
    ]);

    assert.equal(
        exported,
        [
            'timestamp\tsource\tlabel\trequestId\tassetCount\tpreviewCount\tpreviousAssetCount\tnextAssetCount\tapplied\tdetail',
            '2026-03-14T10:00:00.000Z\tasset_response\tAssets refresh response\tget_assets-1\t20\t5\t10\t20\tyes\tincoming=20; incomingPreviews=5',
        ].join('\n'),
    );
});
