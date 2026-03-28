const test = require('node:test');
const assert = require('node:assert/strict');

test('shared photo metadata block shape includes caption and description', async () => {
    const {
        isPhotoMetadataBlock,
        isPhotoMetadataFieldPath,
        normalizeIsoDateOrNull,
    } = await import('../../dist/core/src/services/photoMetadata/validation.js');
    const { PHOTO_METADATA_ASSERTION_FIELD_PATHS } = await import('../../dist/core/src/services/photoMetadata/fieldPaths.js');

    const block = {
        type: 'Family portrait',
        caption: 'Billy and Dad enjoying Christmas dinner',
        description: 'A warm family dinner scene around a holiday table.',
        location: 'Unknown',
        estimated_date: {
            most_likely_date: '1978-12-25T00:00:00Z',
            min_date: '1978-01-01T00:00:00.000Z',
            max_date: '1978-12-31T23:59:59.999Z',
            display_label: 'late 1970s',
            rationale: 'Christmas dinner and clothing style point to the late 1970s.',
        },
        subjects: [],
        regions_of_interest: [],
        keywords: ['family', 'christmas'],
        emotional_impact: 'Warm',
        quality: {
            technical: 7,
            lighting: 7,
            composition: 8,
            emotional: 9,
            discard: false,
        },
        recommended_enhancements: [],
        authenticity: {
            score: 8,
            reasons: ['Consistent with the period'],
        },
    };

    assert.equal(isPhotoMetadataBlock(block), true);
    assert.equal(block.caption, 'Billy and Dad enjoying Christmas dinner');
    assert.equal(block.description, 'A warm family dinner scene around a holiday table.');
    assert.equal(isPhotoMetadataFieldPath('caption'), true);
    assert.equal(isPhotoMetadataFieldPath('estimated_date.display_label'), true);
    assert.equal(isPhotoMetadataFieldPath('not.a.real.path'), false);
    assert.equal(normalizeIsoDateOrNull('1978-12-25T00:00:00.000Z'), '1978-12-25T00:00:00.000Z');
    assert.equal(normalizeIsoDateOrNull('1978-12-25T00:00:00Z'), '1978-12-25T00:00:00Z');
    assert.equal(normalizeIsoDateOrNull('not-a-date'), null);
    assert.deepEqual(PHOTO_METADATA_ASSERTION_FIELD_PATHS.includes('caption'), true);
});

test('estimated date is structured rather than plain text', async () => {
    const { isPhotoMetadataBlock } = await import('../../dist/core/src/services/photoMetadata/validation.js');

    const block = {
        type: 'Portrait',
        caption: 'Test caption',
        description: 'Test description',
        location: 'Unknown',
        estimated_date: 'late 1970s',
        subjects: [],
        regions_of_interest: [],
        keywords: [],
        emotional_impact: 'Calm',
        quality: {
            technical: 5,
            lighting: 5,
            composition: 5,
            emotional: 5,
            discard: false,
        },
        recommended_enhancements: [],
        authenticity: {
            score: 5,
            reasons: [],
        },
    };

    assert.equal(isPhotoMetadataBlock(block), false);
});

test('estimated date accepts coarse year and decade hints in structured blocks', async () => {
    const { isPhotoMetadataBlock } = await import('../../dist/core/src/services/photoMetadata/validation.js');

    const block = {
        type: 'Birthday party',
        caption: 'A child celebrates a birthday',
        description: 'A family gathers around a cake while the birthday child smiles at the camera.',
        location: 'Unknown',
        estimated_date: {
            most_likely_date: '1970s',
            min_date: '1974',
            max_date: null,
            display_label: 'mid 1970s',
            rationale: 'Clothing and decorations suggest the middle of the decade.',
        },
        subjects: [],
        regions_of_interest: [],
        keywords: ['birthday', 'family'],
        emotional_impact: 'Joyful',
        quality: {
            technical: 6,
            lighting: 6,
            composition: 6,
            emotional: 8,
            discard: false,
        },
        recommended_enhancements: [],
        authenticity: {
            score: 7,
            reasons: ['Scene details are consistent with the period'],
        },
    };

    assert.equal(isPhotoMetadataBlock(block), true);
});

test('subjects expose suggested names in both machine tiers', async () => {
    const { isPhotoMetadataBlock } = await import('../../dist/core/src/services/photoMetadata/validation.js');

    const block = {
        type: 'Portrait',
        caption: 'Test caption',
        description: 'Test description',
        location: 'Unknown',
        estimated_date: {
            most_likely_date: null,
            min_date: null,
            max_date: null,
            display_label: 'Unknown',
            rationale: null,
        },
        subjects: [
            {
                label: 'Subject1',
                bounding_box: { x: 1, y: 2, width: 3, height: 4 },
                type: 'person',
                location_desc: 'center',
                gender: 'unknown',
                animal_type: null,
                age_range: null,
                dob_range: null,
                emotion: null,
                gaze: null,
                features: null,
                uniform: null,
                suggested_names: ['Frank'],
            },
        ],
        regions_of_interest: [],
        keywords: [],
        emotional_impact: 'Calm',
        quality: {
            technical: 5,
            lighting: 5,
            composition: 5,
            emotional: 5,
            discard: false,
        },
        recommended_enhancements: [],
        authenticity: {
            score: 5,
            reasons: [],
        },
    };

    assert.equal(isPhotoMetadataBlock(block), true);
    assert.equal(block.subjects[0].suggested_names[0], 'Frank');
});

test('regions of interest are represented separately from subjects', async () => {
    const { isPhotoMetadataBlock } = await import('../../dist/core/src/services/photoMetadata/validation.js');

    const block = {
        type: 'Document',
        caption: 'Test caption',
        description: 'Test description',
        location: 'Unknown',
        estimated_date: {
            most_likely_date: null,
            min_date: null,
            max_date: null,
            display_label: 'Unknown',
            rationale: null,
        },
        subjects: [],
        regions_of_interest: [
            {
                label: 'Signage',
                kind: 'text',
                bounding_box: { x: 10, y: 20, width: 30, height: 40 },
                significance: 'Helpful for location reasoning',
            },
        ],
        keywords: [],
        emotional_impact: 'Calm',
        quality: {
            technical: 5,
            lighting: 5,
            composition: 5,
            emotional: 5,
            discard: false,
        },
        recommended_enhancements: [],
        authenticity: {
            score: 5,
            reasons: [],
        },
    };

    assert.equal(isPhotoMetadataBlock(block), true);
    assert.equal(block.subjects.length, 0);
    assert.equal(block.regions_of_interest.length, 1);
    assert.equal(block.regions_of_interest[0].label, 'Signage');
});
