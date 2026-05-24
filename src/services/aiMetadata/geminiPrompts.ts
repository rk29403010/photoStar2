export type GeminiPromptInput = {
    filename: string;
    exifDataString: string;
    imageStrategy?: 'overview_only' | 'overview_plus_tiles';
    approvedTagVocabulary?: string[];
    tileCoordinateInstructions?: string[];
    /** Oriented pixel width/height of the full original (matches sharp().rotate() / attached overview). */
    originalImagePixelWidth?: number | null;
    originalImagePixelHeight?: number | null;
}

function buildImagePartInstructions(params: {
    imageStrategy: GeminiPromptInput['imageStrategy'];
    tileCoordinateInstructions?: string[];
}): string {
    if (params.imageStrategy !== 'overview_plus_tiles') {
        return `The prompt includes one image representing the original photo.
Because only one image is provided, every "source_image_index" must be 1 or null.
Do not reference image parts 2 through 5 in this request.`;
    }

    const tileCoordinateInstructions = params.tileCoordinateInstructions?.length
        ? `\n${params.tileCoordinateInstructions.join('\n')}`
        : '';

    return `Image 1 is the full overview of the original photo.
Images 2 through 5 are detail crops from the same original photo.
Treat all image parts as coordinated views of one photo, not as separate unrelated photos.
Use the overview for whole-scene context and the crops for local detail such as faces, clothing, signage, inscriptions, or small background clues.${tileCoordinateInstructions}
Each crop description gives original-photo pixel bounds for reference only.
Even when using a crop, return every bounding box in full-photo normalized 0 to 1000 coordinates.`;
}

function buildCoordinateContractSection(params: {
    imageStrategy: GeminiPromptInput['imageStrategy'];
    originalImagePixelWidth?: number | null;
    originalImagePixelHeight?: number | null;
}): string {
    const width = params.originalImagePixelWidth;
    const height = params.originalImagePixelHeight;
    const hasDimensions = typeof width === 'number'
        && typeof height === 'number'
        && Number.isFinite(width)
        && Number.isFinite(height)
        && width > 0
        && height > 0;

    const dimensionLine = hasDimensions
        ? `Full original photo pixel size after EXIF orientation (same content as the attached overview): ${Math.round(width)} wide × ${Math.round(height)} tall.`
        : 'Full original photo width and height in pixels could not be read; treat the attached overview as the complete original frame.';

    const singleImageRules = params.imageStrategy !== 'overview_plus_tiles'
        ? `Only one overview image is attached. For every subject and every region_of_interest entry:
- Set "bounding_box_coordinate_space" to the string "full_photo" (never "crop_local").
- Set "source_image_index" to 1 or null (never 2–5).
`
        : '';

    return `=== Bounding box coordinate contract (mandatory) ===
${dimensionLine}
${singleImageRules}
Global rules for every bounding_box:
- One axis-aligned system for the entire photo. Origin (0,0) is the top-left of the visible image; x increases right, y increases down.
- Express x, y, width, and height as thousandths of the full image: use numbers from 0 through 1000 inclusive where 0 is the left or top edge and 1000 corresponds to the right or bottom edge along that axis (linear fractions of width for x/width and of height for y/height).
- Coordinates MUST be relative to the ENTIRE input image file canvas, including any scanner borders, black bars, white margins, or padding. Do NOT ignore borders! The absolute top-left edge of the full canvas is (0,0) and the absolute bottom-right edge is (1000,1000).
- Simply return coordinates in the normalized 0 to 1000 coordinate space of the image content you see, where 0 is the left/top edge and 1000 is the right/bottom edge of the image canvas.
- Use the same full_photo grid for every subject and ROI so boxes stay aligned.
- Each box must match the visible feature in the photo; do not place different subjects using different implicit canvases or mixed coordinate origins.
`;
}

function buildSharedMetadataSchema(): string {
    return `Return a single JSON object matching this archival metadata schema exactly.
Keep the answer conservative and useful for long-term archive indexing.
Prefer Unknown, null, or empty arrays over guessing.
Use the full original photo (including scanner borders, margins, or padding, if present) as the coordinate space for every bounding box.
The origin (0,0) is the absolute top-left corner of the full original photo canvas.
Use a normalized 0 to 1000 grid for bounding boxes, where x and y are the top-left corner and width/height are box size.
Do not ignore scanner borders or black/white bars when computing coordinates.
Do not use bottom-left coordinates, cropped-image coordinates, or raw pixel counts from the downscaled attachment.
Set "source_image_index" to the image part that most directly supports each subject or region.
Set "bounding_box_coordinate_space" to "full_photo" when the box already uses full original photo coordinates.
If you must estimate the box inside a detail crop instead, set "bounding_box_coordinate_space" to "crop_local" and use that crop's own normalized 0 to 1000 grid.
If only one image is provided, "source_image_index" must be 1 or null.
If multiple image parts are provided, only reference image parts that were actually sent.
For person subjects, the bounding box must tightly frame the visible head and face area, including hair if visible.
Do not use a rough row location, empty background, windows, torso-only boxes, or full-body boxes when a face is visible.
If the face is too small or unclear to box tightly, omit that subject instead of guessing a loose location box.
For signage or house numbers, only return exact digits when they are clearly legible. If uncertain, use a generic label such as "House number plaque" instead of inventing digits.

{
  "type": "string (Landscape, Group portrait, Family portrait, Document, Newspaper clipping, Drawing, Painting, Selfie, Gravestone)",
  "caption": "string (short one-line summary, e.g. 'Billy and Dad enjoying Christmas dinner')",
  "description": "string (fuller narrative description of the visible photo content and context)",
  "estimated_date": {
    "most_likely_date": "string or null (ISO date if exact, otherwise a year, decade, or null)",
    "min_date": "string or null (earliest plausible ISO date)",
    "max_date": "string or null (latest plausible ISO date)",
    "display_label": "string (e.g. 'late 1970s')",
    "rationale": "string (why this date range was chosen)"
  },
  "location": "string (estimated location or 'Unknown')",
  "subjects": [
    {
      "label": "string (e.g. Subject1, unique per subject)",
      "bounding_box": { "x": number, "y": number, "width": number, "height": number },
      "source_image_index": "number or null (1 for overview, 2-5 for detail crop)",
      "bounding_box_coordinate_space": "full_photo | crop_local | null",
      "type": "person | pet",
      "location_desc": "string (e.g. '2nd from left')",
      "gender": "male | female | other | unknown",
      "animal_type": "string or null",
      "age_range": "string or null",
      "dob_range": "string or null",
      "emotion": "string or null",
      "gaze": "string or null",
      "features": "string or null",
      "uniform": "string or null",
      "suggested_names": ["string"]
    }
  ],
  "regions_of_interest": [
    {
      "label": "string",
      "kind": "string (signage, handwriting, clothing, vehicle, architecture, inscription, document, object, other)",
      "bounding_box": { "x": number, "y": number, "width": number, "height": number },
      "source_image_index": "number or null (1 for overview, 2-5 for detail crop)",
      "bounding_box_coordinate_space": "full_photo | crop_local | null",
      "significance": "string or null"
    }
  ],
  "keywords": ["string chosen only from the approved canonical tag vocabulary"],
  "tag_proposals": ["string for genuinely missing concepts that are not already in the approved canonical tag vocabulary"],
  "emotional_impact": "string",
  "quality": {
    "technical": number,
    "lighting": number,
    "composition": number,
    "emotional": number,
    "discard": boolean
  },
  "recommended_enhancements": ["string"],
  "authenticity": { "score": number, "reasons": ["string"] }
}`;
}

function buildPromptBody(params: {
    filename: string;
    exifDataString: string;
    intro: string;
    analysisPreamble: string;
    imageStrategy?: GeminiPromptInput['imageStrategy'];
    approvedTagVocabulary?: string[];
    tileCoordinateInstructions?: string[];
    originalImagePixelWidth?: number | null;
    originalImagePixelHeight?: number | null;
}): string {
    const approvedVocabulary = params.approvedTagVocabulary ?? [];
    const approvedVocabularyInstructions = approvedVocabulary.length > 0
        ? `Approved canonical tag vocabulary:
- ${approvedVocabulary.join('\n- ')}

Tagging rules:
- Populate "keywords" only with tags from the approved canonical vocabulary above.
- If a useful concept is missing from that approved vocabulary, put it in "tag_proposals" instead of "keywords".
- Do not invent broad low-value labels like "adult", "person", or "photo".`
        : `Approved canonical tag vocabulary:
- none provided

Tagging rules:
- Leave "keywords" empty when no approved canonical vocabulary is provided.
- Put any genuinely useful missing concepts in "tag_proposals" instead.`;

    return `${params.intro}
${params.analysisPreamble}

Context metadata:
- Filename: ${params.filename}
- EXIF Data: ${params.exifDataString || 'none'}
${buildImagePartInstructions({
    imageStrategy: params.imageStrategy,
    tileCoordinateInstructions: params.tileCoordinateInstructions,
})}

${buildCoordinateContractSection({
    imageStrategy: params.imageStrategy,
    originalImagePixelWidth: params.originalImagePixelWidth,
    originalImagePixelHeight: params.originalImagePixelHeight,
})}

${buildSharedMetadataSchema()}

${approvedVocabularyInstructions}`;
}

export function buildGeminiProPrompt({
    filename,
    exifDataString,
    imageStrategy,
    approvedTagVocabulary,
    tileCoordinateInstructions,
    originalImagePixelWidth,
    originalImagePixelHeight,
}: GeminiPromptInput): string {
    return buildPromptBody({
        filename,
        exifDataString,
        imageStrategy,
        approvedTagVocabulary,
        tileCoordinateInstructions,
        originalImagePixelWidth,
        originalImagePixelHeight,
        intro: 'You are an expert photo archivist and AI analyst with access to extended thinking.',
        analysisPreamble: 'Use step-by-step reasoning to carefully analyse this image, then respond ONLY with valid JSON.',
    });
}

export function buildGeminiFlashPrompt({
    filename,
    exifDataString,
    imageStrategy,
    approvedTagVocabulary,
    tileCoordinateInstructions,
    originalImagePixelWidth,
    originalImagePixelHeight,
}: GeminiPromptInput): string {
    return buildPromptBody({
        filename,
        exifDataString,
        imageStrategy,
        approvedTagVocabulary,
        tileCoordinateInstructions,
        originalImagePixelWidth,
        originalImagePixelHeight,
        intro: 'You are a photo archivist.',
        analysisPreamble: 'Analyse this image with careful archival judgement and return ONLY valid JSON.',
    });
}
