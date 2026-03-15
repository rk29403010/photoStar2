const test = require('node:test');
const assert = require('node:assert/strict');

const {
    summarizeForEventLog,
    buildEventLogEnvelope,
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
