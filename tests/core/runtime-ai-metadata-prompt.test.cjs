const test = require('node:test');
const assert = require('node:assert/strict');

function expectSharedMetadataFields(prompt) {
    assert.match(prompt, /"caption": "string \(short one-line summary/i);
    assert.match(prompt, /"description": "string \(fuller narrative description/i);
    assert.match(prompt, /"estimated_date": \{/i);
    assert.match(prompt, /"display_label": "string \(e\.g\. 'late 1970s'\)/i);
    assert.match(prompt, /"rationale": "string \(why this date range was chosen\)"/i);
    assert.match(prompt, /"regions_of_interest": \[/i);
    assert.match(prompt, /"kind": "string \(signage, handwriting, clothing, vehicle, architecture, inscription, document, object, other\)"/i);
    assert.match(prompt, /"significance": "string or null"/i);
    assert.match(prompt, /"suggested_names": \["string"\]/i);
    assert.match(prompt, /"uniform": "string or null"/i);
    assert.match(prompt, /"features": "string or null"/i);
    assert.match(prompt, /"gaze": "string or null"/i);
    assert.match(prompt, /"dob_range": "string or null"/i);
    assert.match(prompt, /"animal_type": "string or null"/i);
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
    assert.match(proPrompt, /Unknown, null, or empty arrays over guessing/i);
    assert.match(flashPrompt, /Unknown, null, or empty arrays over guessing/i);

    expectSharedMetadataFields(proPrompt);
    expectSharedMetadataFields(flashPrompt);
    assert.match(proPrompt, /short one-line summary/i);
    assert.match(proPrompt, /fuller narrative/i);
    assert.match(flashPrompt, /short one-line summary/i);
    assert.match(flashPrompt, /fuller narrative/i);
});
