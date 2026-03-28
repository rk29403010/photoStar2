const test = require('node:test');
const assert = require('node:assert/strict');

const {
    summarizeForEventLog,
    buildEventLogEnvelope,
    formatEventEnvelopeForConsole,
} = require('../../dist/core/src/shared/utils/eventLogSummary.js');

test('summarizeForEventLog collapses long id arrays to head and tail items', () => {
    const mediaIds = [
        'media-1',
        'media-2',
        'media-3',
        'media-4',
        'media-5',
        'media-6',
        'media-7',
        'media-8',
    ];

    const summary = summarizeForEventLog({
        type: 'FaceRecognitionRequested',
        mediaIds,
    });

    assert.deepEqual(summary, {
        type: 'FaceRecognitionRequested',
        mediaIds: ['media-1', 'media-2', '... 4 omitted ...', 'media-7', 'media-8'],
    });
});

test('buildEventLogEnvelope summarizes event payloads for backend log output', () => {
    const mediaIds = [
        'media-1',
        'media-2',
        'media-3',
        'media-4',
        'media-5',
        'media-6',
        'media-7',
        'media-8',
    ];

    const envelope = buildEventLogEnvelope({
        id: 'event_stream',
        status: 'event',
        data: {
            type: 'FaceRecognitionRequested',
            mediaIds,
        },
        error: null,
    });

    assert.deepEqual(envelope, {
        id: 'event_stream',
        status: 'event',
        data: {
            type: 'FaceRecognitionRequested',
            mediaIds: ['media-1', 'media-2', '... 4 omitted ...', 'media-7', 'media-8'],
        },
        error: null,
    });
});

test('formatEventEnvelopeForConsole collapses event stream wrapper for readable console output', () => {
    const formatted = formatEventEnvelopeForConsole({
        id: 'event_stream',
        status: 'event',
        data: {
            type: 'FaceClusteringUpdated',
            clusterId: '356d6693-59c7-4017-88f3-ddfa3067a3df',
        },
        error: null,
    });

    assert.deepEqual(formatted, {
        level: 'log',
        text: 'FaceClusteringUpdated: clusterId="356d6693-59c7-4017-88f3-ddfa3067a3df"',
    });
});

test('formatEventEnvelopeForConsole marks event stream errors for red console output', () => {
    const formatted = formatEventEnvelopeForConsole({
        id: 'event_stream',
        status: 'event',
        data: {
            type: 'FaceClusteringUpdated',
            clusterId: '356d6693-59c7-4017-88f3-ddfa3067a3df',
            error: "can't be bothered",
        },
        error: null,
    });

    assert.deepEqual(formatted, {
        level: 'error',
        text: 'FaceClusteringUpdated: clusterId="356d6693-59c7-4017-88f3-ddfa3067a3df"; error="can\'t be bothered"',
    });
});

test('summarizeForEventLog formats long ids and paths into readable diagnostics', () => {
    const summary = summarizeForEventLog({
        assetId: 'b63e89b7-93d9-4e19-881c-e66e66ef9093',
        original_path: 'C:\\Users\\robin\\Pictures\\Family History\\b1s10_02.jpg',
        preview_path: 'C:\\Users\\robin\\AppData\\Roaming\\PhotoLibraryDesktop\\previews\\b63e89b7-93d9-4e19-881c-e66e66ef9093-thumbnail.webp',
    });

    assert.deepEqual(summary, {
        assetId: 'b63e--9093',
        original_path: 'b1s10_02.jpg',
        preview_path: 'b63e89b7-93d9-4e19-881c-e66e66ef9093-thumbnail.webp',
    });
});

test('formatEventEnvelopeForConsole summarizes asset updates as actionable outcomes', () => {
    const formatted = formatEventEnvelopeForConsole({
        id: 'event_stream',
        status: 'event',
        data: {
            type: 'AssetUpdated',
            asset: {
                id: 'b63e89b7-93d9-4e19-881c-e66e66ef9093',
                original_path: 'C:\\Users\\robin\\Pictures\\Family History\\b1s10_02.jpg',
                preview_path: 'C:\\Users\\robin\\AppData\\Roaming\\PhotoLibraryDesktop\\previews\\b63e89b7-93d9-4e19-881c-e66e66ef9093-thumbnail.webp',
                caption: 'A very long caption that should not be dumped into the log output.',
            },
        },
        error: null,
    });

    assert.deepEqual(formatted, {
        level: 'log',
        text: 'AssetUpdated: refreshed asset b63e--9093 (b1s10_02.jpg)',
    });
});
