const test = require('node:test');
const assert = require('node:assert/strict');

test('resolvePhotoDateEvidence turns structured machine dates into timestamp candidates', async () => {
    const { resolvePhotoDateEvidence } = await import('../../dist/core/src/services/photoMetadata/dateResolver.js');
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const resolved = resolvePhotoDateEvidence({
        originalPath: 'C:/photos/family-reunion.png',
        fileBirthtime: '2026-03-20T00:00:00.000Z',
        embeddedMetadata: {
            embedded: {
                exif: {
                    Make: 'Canon',
                    Model: 'Canon EOS 5D Mark IV',
                },
            },
        },
        metadataEvidence: {
            machineBlocks: [
                {
                    id: 'block-1',
                    source_kind: 'gemini_flash_scout',
                    created_at: '2026-03-21T00:00:00.000Z',
                    data: {
                        estimated_date: {
                            most_likely_date: '1948-07-04T00:00:00.000Z',
                            min_date: '1940-01-01T00:00:00.000Z',
                            max_date: '1950-12-31T23:59:59.999Z',
                            display_label: 'late 40s',
                            rationale: 'Wedding photo date hinted by dress and file name',
                        },
                    },
                },
            ],
        },
    });

    assert.equal(resolved.aiMetadata.estimated_date.display_label, 'late 40s');
    assert.equal(resolved.aiMetadata.estimated_date.most_likely_date, '1948-07-04T00:00:00.000Z');
    assert.equal(resolved.aiMetadata.estimated_date.min_date, '1940-01-01T00:00:00.000Z');
    assert.equal(resolved.aiMetadata.estimated_date.max_date, '1950-12-31T23:59:59.999Z');
    assert.deepEqual(
        resolved.embeddedMetadata.derived.timestamp_candidates.map((candidate) => candidate.source),
        [
            'machine:block-1.estimated_date.most_likely_date',
        ],
    );

    const result = estimatePhotoDate(resolved);

    assert.equal(result.photoCreatedAt, '1948-07-04T00:00:00.000Z');
    assert.ok(result.signals.some((signal) => signal.source === 'ai.estimated_date.range'));
    assert.ok(result.confidence.score > 0);
});

test('resolvePhotoDateEvidence turns manual date assertions into timestamp candidates', async () => {
    const { resolvePhotoDateEvidence } = await import('../../dist/core/src/services/photoMetadata/dateResolver.js');
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const resolved = resolvePhotoDateEvidence({
        originalPath: 'C:/photos/Frank-1968.png',
        fileBirthtime: '2026-03-20T00:00:00.000Z',
        metadataEvidence: {
            manualAssertions: [
                {
                    id: 'assertion-1',
                    asset_id: 'asset-1',
                    field_path: 'estimated_date.most_likely_date',
                    value: '1968-05-18T00:00:00.000Z',
                    user_id: 'user-1',
                    note: 'wedding album caption',
                    created_at: '2026-03-21T12:00:00.000Z',
                },
                {
                    id: 'assertion-2',
                    asset_id: 'asset-1',
                    field_path: 'estimated_date.display_label',
                    value: 'late 60s',
                    user_id: 'user-2',
                    note: 'filename clue',
                    created_at: '2026-03-22T12:00:00.000Z',
                },
            ],
        },
    });

    assert.equal(resolved.aiMetadata.estimated_date.display_label, 'late 60s');
    assert.equal(resolved.aiMetadata.estimated_date.most_likely_date, '1968-05-18T00:00:00.000Z');
    assert.deepEqual(
        resolved.embeddedMetadata.derived.timestamp_candidates.map((candidate) => candidate.source),
        [
            'manual:assertion-1.estimated_date.most_likely_date',
        ],
    );

    const result = estimatePhotoDate(resolved);

    assert.equal(result.photoCreatedAt, '1968-05-18T00:00:00.000Z');
    assert.ok(result.confidence.score > 0);
});

test('estimatePhotoDate lowers confidence when evidence sources disagree', async () => {
    const { resolvePhotoDateEvidence } = await import('../../dist/core/src/services/photoMetadata/dateResolver.js');
    const { estimatePhotoDate } = await import('../../dist/core/src/services/photoDateEstimate.js');

    const aligned = resolvePhotoDateEvidence({
        originalPath: 'C:/photos/aligned-photo.png',
        metadataEvidence: {
            machineBlocks: [
                {
                    id: 'block-1',
                    source_kind: 'gemini_flash_scout',
                    created_at: '2026-03-21T00:00:00.000Z',
                    data: {
                        estimated_date: {
                            most_likely_date: '1948-07-04T00:00:00.000Z',
                            min_date: '1948-01-01T00:00:00.000Z',
                            max_date: '1948-12-31T23:59:59.999Z',
                            display_label: '1948',
                            rationale: null,
                        },
                    },
                },
            ],
        },
    });

    const conflicting = resolvePhotoDateEvidence({
        originalPath: 'C:/photos/conflict-photo.png',
        metadataEvidence: {
            machineBlocks: [
                {
                    id: 'block-1',
                    source_kind: 'gemini_flash_scout',
                    created_at: '2026-03-21T00:00:00.000Z',
                    data: {
                        estimated_date: {
                            most_likely_date: '1948-07-04T00:00:00.000Z',
                            min_date: '1948-01-01T00:00:00.000Z',
                            max_date: '1948-12-31T23:59:59.999Z',
                            display_label: '1948',
                            rationale: null,
                        },
                    },
                },
            ],
            manualAssertions: [
                {
                    id: 'assertion-1',
                    asset_id: 'asset-3',
                    field_path: 'estimated_date.most_likely_date',
                    value: '1988-08-12T00:00:00.000Z',
                    user_id: 'user-1',
                    note: null,
                    created_at: '2026-03-22T12:00:00.000Z',
                },
            ],
        },
    });

    const alignedResult = estimatePhotoDate(aligned);
    const conflictingResult = estimatePhotoDate(conflicting);

    assert.equal(alignedResult.photoCreatedAt, '1948-07-04T00:00:00.000Z');
    assert.equal(conflictingResult.photoCreatedAt, '1988-08-12T00:00:00.000Z');
    assert.ok(conflictingResult.confidence.score < alignedResult.confidence.score);
    assert.ok(conflictingResult.confidence.reasons.some((reason) => reason.includes('disagrees')));
});
