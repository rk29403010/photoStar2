const test = require('node:test');
const assert = require('node:assert/strict');

function expectSharedMetadataFields(prompt) {
    assert.match(prompt, /caption/i);
    assert.match(prompt, /description/i);
    assert.match(prompt, /estimated_date/i);
    assert.match(prompt, /regions_of_interest/i);
    assert.match(prompt, /suggested_names/i);
    assert.match(prompt, /uniform/i);
    assert.match(prompt, /features/i);
    assert.match(prompt, /gaze/i);
    assert.match(prompt, /dob_range/i);
    assert.match(prompt, /animal_type/i);
}

test('buildGemini prompts request the same shared archival metadata fields', async () => {
    const { buildGeminiFlashPrompt, buildGeminiProPrompt } = await import('../../dist/core/src/services/aiMetadata/geminiPrompts.js');

    const commonInput = {
        filename: 'Family Picnic 1964.jpg',
        exifDataString: '{"DateTimeOriginal":"1964:08:10 12:00:00"}',
    };
    const proPrompt = buildGeminiProPrompt(commonInput);
    const flashPrompt = buildGeminiFlashPrompt(commonInput);

    assert.match(proPrompt, /expert photo archivist and AI analyst/i);
    assert.match(proPrompt, /respond ONLY with valid JSON/i);
    assert.match(flashPrompt, /photo archivist/i);
    assert.match(flashPrompt, /return ONLY valid JSON/i);

    expectSharedMetadataFields(proPrompt);
    expectSharedMetadataFields(flashPrompt);
    assert.match(proPrompt, /short one-line summary/i);
    assert.match(proPrompt, /fuller narrative/i);
    assert.match(flashPrompt, /short one-line summary/i);
    assert.match(flashPrompt, /fuller narrative/i);
});
