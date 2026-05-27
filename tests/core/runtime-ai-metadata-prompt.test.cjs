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
    assert.match(prompt, /"source_image_index": "number or null/i);
    assert.match(prompt, /"bounding_box_coordinate_space": "full_photo \| crop_local \| null"/i);
    assert.match(prompt, /"uniform": "string or null"/i);
    assert.match(prompt, /"features": "string or null"/i);
    assert.match(prompt, /"gaze": "string or null"/i);
    assert.match(prompt, /"dob_range": "string or null"/i);
    assert.match(prompt, /"animal_type": "string or null"/i);
    assert.match(prompt, /Use the full original photo/i);
    assert.match(prompt, /Use a normalized 0 to 1000 grid/i);
    assert.match(prompt, /Do not use bottom-left coordinates/i);
    assert.match(prompt, /Set "source_image_index" to the image part/i);
    assert.match(prompt, /set "bounding_box_coordinate_space" to "crop_local"/i);
    assert.match(prompt, /If multiple image parts are provided, only reference image parts that were actually sent/i);
    assert.match(prompt, /only return exact digits when they are clearly legible/i);
    assert.match(prompt, /bounding box must tightly frame the visible head and face area/i);
    assert.match(prompt, /omit that subject instead of guessing a loose location box/i);
    assert.match(prompt, /=== Bounding box coordinate contract/i);
    assert.match(prompt, /native format: \[ymin, xmin, ymax, xmax\]/i);
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

test('buildGemini tiled prompts include crop bounds while keeping full-photo normalized coordinates', async () => {
    const { buildGeminiFlashPrompt } = await import('../../dist/core/src/services/aiMetadata/geminiPrompts.js');

    const prompt = buildGeminiFlashPrompt({
        filename: 'Group Photo.jpg',
        exifDataString: '{}',
        imageStrategy: 'overview_plus_tiles',
        tileCoordinateInstructions: [
            'Image 2 covers the full-photo pixel region left=0, top=0, width=1000, height=600.',
            'Image 3 covers the full-photo pixel region left=1000, top=0, width=1000, height=600.',
        ],
    });

    assert.match(prompt, /Image 2 covers the full-photo pixel region left=0, top=0, width=1000, height=600\./i);
    assert.match(prompt, /return every bounding box in full-photo normalized 0 to 1000 coordinates/i);
    assert.doesNotMatch(prompt, /crop-local coordinates are allowed/i);
});

test('buildGemini overview-only prompts constrain source image references to the overview image', async () => {
    const { buildGeminiFlashPrompt } = await import('../../dist/core/src/services/aiMetadata/geminiPrompts.js');

    const prompt = buildGeminiFlashPrompt({
        filename: 'Doorway Portrait.jpg',
        exifDataString: '{}',
        imageStrategy: 'overview_only',
    });

    assert.match(prompt, /every "source_image_index" must be 1 or null/i);
    assert.match(prompt, /Do not reference image parts 2 through 5/i);
    assert.match(prompt, /Set "bounding_box_coordinate_space" to the string "full_photo"/i);
});

test('buildGemini prompts repeat EXIF-oriented pixel dimensions in the coordinate contract when provided', async () => {
    const { buildGeminiFlashPrompt } = await import('../../dist/core/src/services/aiMetadata/geminiPrompts.js');

    const prompt = buildGeminiFlashPrompt({
        filename: 'b3s8_09.jpg',
        exifDataString: '{}',
        imageStrategy: 'overview_only',
        originalImagePixelWidth: 2883,
        originalImagePixelHeight: 5151,
    });

    assert.match(prompt, /2883 wide × 5151 tall/i);
});
