export interface GeminiPromptInput {
    filename: string;
    exifDataString: string;
    imageStrategy?: 'overview_only' | 'overview_plus_tiles';
    approvedTagVocabulary?: string[];
}

function buildImagePartInstructions(imageStrategy: GeminiPromptInput['imageStrategy']): string {
    if (imageStrategy !== 'overview_plus_tiles') {
        return 'The prompt includes one image representing the original photo.';
    }

    return `Image 1 is the full overview of the original photo.
Images 2 through 5 are detail crops from the same original photo.
Treat all image parts as coordinated views of one photo, not as separate unrelated photos.
Use the overview for whole-scene context and the crops for local detail such as faces, clothing, signage, inscriptions, or small background clues.`;
}

function buildSharedMetadataSchema(): string {
    return `Return a single JSON object matching this archival metadata schema exactly.
Keep the answer conservative and useful for long-term archive indexing.
Prefer Unknown, null, or empty arrays over guessing.

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
${buildImagePartInstructions(params.imageStrategy)}

${buildSharedMetadataSchema()}

${approvedVocabularyInstructions}`;
}

export function buildGeminiProPrompt({ filename, exifDataString, imageStrategy, approvedTagVocabulary }: GeminiPromptInput): string {
    return buildPromptBody({
        filename,
        exifDataString,
        imageStrategy,
        approvedTagVocabulary,
        intro: 'You are an expert photo archivist and AI analyst with access to extended thinking.',
        analysisPreamble: 'Use step-by-step reasoning to carefully analyse this image, then respond ONLY with valid JSON.',
    });
}

export function buildGeminiFlashPrompt({ filename, exifDataString, imageStrategy, approvedTagVocabulary }: GeminiPromptInput): string {
    return buildPromptBody({
        filename,
        exifDataString,
        imageStrategy,
        approvedTagVocabulary,
        intro: 'You are a photo archivist.',
        analysisPreamble: 'Analyse this image with careful archival judgement and return ONLY valid JSON.',
    });
}
