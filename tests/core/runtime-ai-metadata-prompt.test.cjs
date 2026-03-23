const test = require('node:test');
const assert = require('node:assert/strict');

test('buildGeminiProPrompt keeps the archivist prompt but does not request CSV-based name suggestions', async () => {
    const { buildGeminiProPrompt } = await import('../../dist/core/src/services/aiMetadata/geminiPrompts.js');

    const prompt = buildGeminiProPrompt({
        filename: 'Family Picnic 1964.jpg',
        exifDataString: '{"DateTimeOriginal":"1964:08:10 12:00:00"}',
    });

    assert.match(prompt, /expert photo archivist and AI analyst/i);
    assert.match(prompt, /gender/i);
    assert.match(prompt, /age_range/i);
    assert.match(prompt, /authenticity/i);
    assert.match(prompt, /respond ONLY with valid JSON/i);
    assert.doesNotMatch(prompt, /Potential Subjects/i);
    assert.doesNotMatch(prompt, /suggested_names/i);
});
