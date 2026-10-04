const test = require('node:test');
const assert = require('node:assert/strict');

function asset(overrides = {}) {
    return {
        faces: [],
        photo_metadata: {
            projection: {
                location: 'Norwich',
                estimatedDate: { display_label: '1920s', most_likely_date: null },
                quality: { technical: 4, lighting: 4, composition: 4, emotional: 4, discard: false },
                recommendedEnhancements: [], subjects: [], regionsOfInterest: [],
            },
            provenance: {},
        },
        ...overrides,
    };
}

test('library readiness keeps appearance and metadata independent', async () => {
    const { deriveLibraryReadiness } = await import('../../dist/core/src/shared/libraryReadiness.js');
    const result = deriveLibraryReadiness(asset({
        photo_metadata: {
            projection: {
                ...asset().photo_metadata.projection,
                recommendedEnhancements: ['reduce colour cast'],
            },
            provenance: {},
        },
    }));

    assert.equal(result.appearance, 'safe_enhancement');
    assert.equal(result.metadata, 'ready');
    assert.deepEqual(result.views, ['quick_wins']);
    assert.equal(result.nextAction, 'review_enhancement');
});

test('quick wins includes already-good photos alongside improvement opportunities', async () => {
    const { deriveLibraryReadiness } = await import('../../dist/core/src/shared/libraryReadiness.js');
    const result = deriveLibraryReadiness(asset());

    assert.deepEqual(result.views, ['ready_now', 'quick_wins']);
    assert.equal(result.nextAction, 'no_action');
});

test('risk-bearing evidence prevents a recommendation becoming a safe enhancement', async () => {
    const { deriveLibraryReadiness } = await import('../../dist/core/src/shared/libraryReadiness.js');
    const result = deriveLibraryReadiness(asset({
        faces: [{ box: { x: 0, y: 0, width: 1, height: 1 } }],
        photo_metadata: {
            projection: {
                ...asset().photo_metadata.projection,
                recommendedEnhancements: ['improve detail'],
                regionsOfInterest: [{ kind: 'inscription', label: 'memorial text' }],
            },
            provenance: {},
        },
    }));

    assert.equal(result.appearance, 'manual_restoration');
    assert.equal(result.nextAction, 'manual_restoration');
    assert.ok(result.attention.some((item) => item.code === 'detail_worth_examining'));
});

test('readiness summary is transparent about assessed dimensions', async () => {
    const { summarizeLibraryReadiness } = await import('../../dist/core/src/shared/libraryReadiness.js');
    const summary = summarizeLibraryReadiness([
        asset(),
        asset({ photo_metadata: undefined }),
    ]);

    assert.equal(summary.assessedCount, 1);
    assert.equal(summary.readinessPercent, 100);
    assert.equal(summary.views.ready_now, 1);
    assert.equal(summary.views.quick_wins, 1);
});
