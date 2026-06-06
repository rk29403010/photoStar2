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
- Bounding boxes must be returned in the native format: [ymin, xmin, ymax, xmax].
- All coordinate values must be integers between 0 and 1000.
- 0 represents the top/left edge of the image canvas, and 1000 represents the bottom/right edge of the image canvas.
- Coordinates MUST be relative to the ENTIRE input image file canvas, including any scanner borders, black bars, white margins, or padding. Do NOT ignore borders!
- Use the same coordinate grid for every subject and region_of_interest.
`;
}

function buildSharedMetadataSchema(): string {
    return `Return a single JSON object matching the requested schema.
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
For signage or house numbers, only return exact digits when they are clearly legible. If uncertain, use a generic label such as "House number plaque" instead of inventing digits.`;
}

function isTemporalTag(tag: string): boolean {
    return /^\d{4}$/.test(tag) || /^\d{4}s$/.test(tag) || /^\d+(?:st|nd|rd|th)\s+century$/i.test(tag);
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
    const filteredVocabulary = (params.approvedTagVocabulary ?? []).filter((tag) => !isTemporalTag(tag));
    const approvedVocabularyInstructions = filteredVocabulary.length > 0
        ? `Approved canonical tag vocabulary:
- ${filteredVocabulary.join('\n- ')}

Tagging rules:
- Populate "keywords" only with tags from the approved canonical vocabulary above.
- Years (e.g. "1982"), Decades (e.g. "1980s"), and Centuries (e.g. "20th century") are implicitly approved and should be used directly in "keywords" as keywords when applicable. Do not propose them in "tag_proposals".
- If a useful concept is missing from that approved vocabulary, put it in "tag_proposals" instead of "keywords".
- Do not invent broad low-value labels like "adult", "person", or "photo".`
        : `Approved canonical tag vocabulary:
- none provided

Tagging rules:
- Years (e.g. "1982"), Decades (e.g. "1980s"), and Centuries (e.g. "20th century") are implicitly approved and should be used directly in "keywords" as keywords when applicable. Do not propose them in "tag_proposals".
- Leave "keywords" empty (except for implicit years, decades, or centuries) when no approved canonical vocabulary is provided.
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
