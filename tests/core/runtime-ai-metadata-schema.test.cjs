const test = require('node:test');
const assert = require('node:assert/strict');

function getPropertyNames(schema) {
    return Object.keys(schema.properties || {});
}

function getRequiredNames(schema) {
    return schema.required || [];
}

function getSubjectSchema(schema) {
    return schema.properties.subjects.items;
}

function expectSameMembers(actual, expected) {
    assert.deepEqual([...actual].sort(), [...expected].sort());
}

test('buildGemini response schemas share the same archival metadata fields', async () => {
    const {
        buildGeminiFlashResponseSchema,
        buildGeminiProResponseSchema,
    } = await import('../../dist/core/src/services/aiMetadata/geminiResponseSchema.js');

    const flashSchema = buildGeminiFlashResponseSchema();
    const proSchema = buildGeminiProResponseSchema();

    const expectedTopLevelFields = [
        'type',
        'estimated_date',
        'location',
        'subjects',
        'caption',
        'description',
        'regions_of_interest',
        'keywords',
        'emotional_impact',
        'quality',
        'recommended_enhancements',
        'authenticity',
    ];

    expectSameMembers(getPropertyNames(flashSchema), expectedTopLevelFields);
    expectSameMembers(getPropertyNames(proSchema), expectedTopLevelFields);
    expectSameMembers(getRequiredNames(flashSchema), expectedTopLevelFields);
    expectSameMembers(getRequiredNames(proSchema), expectedTopLevelFields);

    const expectedSubjectFields = [
        'label',
        'bounding_box',
        'type',
        'location_desc',
        'gender',
        'animal_type',
        'age_range',
        'dob_range',
        'emotion',
        'gaze',
        'features',
        'uniform',
        'suggested_names',
    ];

    expectSameMembers(getPropertyNames(getSubjectSchema(flashSchema)), expectedSubjectFields);
    expectSameMembers(getPropertyNames(getSubjectSchema(proSchema)), expectedSubjectFields);
    expectSameMembers(getSubjectSchema(flashSchema).required, expectedSubjectFields);
    expectSameMembers(getSubjectSchema(proSchema).required, expectedSubjectFields);
});
