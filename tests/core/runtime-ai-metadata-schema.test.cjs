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

function getEstimatedDateSchema(schema) {
    return schema.properties.estimated_date;
}

function getRegionSchema(schema) {
    return schema.properties.regions_of_interest.items;
}

function getBoundingBoxSchema(schema) {
    return schema.properties.bounding_box;
}

function expectSameMembers(actual, expected) {
    assert.deepEqual([...actual].sort(), [...expected].sort());
}

const EXPECTED_TOP_LEVEL_FIELDS = [
    'type',
    'estimated_date',
    'location',
    'subjects',
    'caption',
    'description',
    'regions_of_interest',
    'keywords',
    'tag_proposals',
    'emotional_impact',
    'quality',
    'recommended_enhancements',
    'authenticity',
];

const EXPECTED_ESTIMATED_DATE_FIELDS = [
    'most_likely_date',
    'min_date',
    'max_date',
    'display_label',
    'rationale',
];

const EXPECTED_SUBJECT_FIELDS = [
    'label',
    'bounding_box',
    'source_image_index',
    'bounding_box_coordinate_space',
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

const EXPECTED_REQUIRED_SUBJECT_FIELDS = EXPECTED_SUBJECT_FIELDS.filter((field) => ![
    'source_image_index',
    'bounding_box_coordinate_space',
].includes(field));

const EXPECTED_REGION_FIELDS = [
    'label',
    'kind',
    'bounding_box',
    'source_image_index',
    'bounding_box_coordinate_space',
    'significance',
];

const EXPECTED_REQUIRED_REGION_FIELDS = EXPECTED_REGION_FIELDS.filter((field) => ![
    'source_image_index',
    'bounding_box_coordinate_space',
].includes(field));

test('buildGemini response schemas share the same archival metadata fields', async () => {
    const {
        buildGeminiFlashResponseSchema,
        buildGeminiProResponseSchema,
    } = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/geminiResponseSchema.js');

    const flashSchema = buildGeminiFlashResponseSchema();
    const proSchema = buildGeminiProResponseSchema();

    expectSameMembers(getPropertyNames(flashSchema), EXPECTED_TOP_LEVEL_FIELDS);
    expectSameMembers(getPropertyNames(proSchema), EXPECTED_TOP_LEVEL_FIELDS);
    expectSameMembers(getRequiredNames(flashSchema), EXPECTED_TOP_LEVEL_FIELDS);
    expectSameMembers(getRequiredNames(proSchema), EXPECTED_TOP_LEVEL_FIELDS);

    expectSameMembers(getPropertyNames(getEstimatedDateSchema(flashSchema)), EXPECTED_ESTIMATED_DATE_FIELDS);
    expectSameMembers(getPropertyNames(getEstimatedDateSchema(proSchema)), EXPECTED_ESTIMATED_DATE_FIELDS);
    expectSameMembers(getRequiredNames(getEstimatedDateSchema(flashSchema)), EXPECTED_ESTIMATED_DATE_FIELDS);
    expectSameMembers(getRequiredNames(getEstimatedDateSchema(proSchema)), EXPECTED_ESTIMATED_DATE_FIELDS);

    expectSameMembers(getPropertyNames(getSubjectSchema(flashSchema)), EXPECTED_SUBJECT_FIELDS);
    expectSameMembers(getPropertyNames(getSubjectSchema(proSchema)), EXPECTED_SUBJECT_FIELDS);
    expectSameMembers(getSubjectSchema(flashSchema).required, EXPECTED_REQUIRED_SUBJECT_FIELDS);
    expectSameMembers(getSubjectSchema(proSchema).required, EXPECTED_REQUIRED_SUBJECT_FIELDS);

    expectSameMembers(getPropertyNames(getRegionSchema(flashSchema)), EXPECTED_REGION_FIELDS);
    expectSameMembers(getPropertyNames(getRegionSchema(proSchema)), EXPECTED_REGION_FIELDS);
    expectSameMembers(getRequiredNames(getRegionSchema(flashSchema)), EXPECTED_REQUIRED_REGION_FIELDS);
    expectSameMembers(getRequiredNames(getRegionSchema(proSchema)), EXPECTED_REQUIRED_REGION_FIELDS);

    assert.match(
        getBoundingBoxSchema(getSubjectSchema(flashSchema)).description,
        /normalized from 0 to 1000/i,
    );
});

test('buildGemini overview-only response schema only allows full_photo coordinate space', async () => {
    const { buildGeminiFlashResponseSchema } = await import('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/geminiResponseSchema.js');

    const overviewSchema = buildGeminiFlashResponseSchema('overview_only');
    const subjectCoord = getSubjectSchema(overviewSchema).properties.bounding_box_coordinate_space;
    const regionCoord = getRegionSchema(overviewSchema).properties.bounding_box_coordinate_space;

    assert.equal(subjectCoord.format, 'enum');
    assert.deepEqual(subjectCoord.enum, ['full_photo']);
    assert.equal(regionCoord.format, 'enum');
    assert.deepEqual(regionCoord.enum, ['full_photo']);
});
