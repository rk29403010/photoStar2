export interface GeminiPromptInput {
    filename: string;
    exifDataString: string;
    imageStrategy?: 'overview_only' | 'overview_plus_tiles';
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

export function buildGeminiProPrompt({ filename, exifDataString, imageStrategy }: GeminiPromptInput): string {
    return `You are an expert photo archivist and AI analyst with access to extended thinking.
Use step-by-step reasoning to carefully analyse this image, then respond ONLY with valid JSON.

Context metadata:
- Filename: ${filename}
- EXIF Data: ${exifDataString || 'none'}
${buildImagePartInstructions(imageStrategy)}

Analyse and return JSON matching this exact schema:
{
  "type": "string (Landscape, Large group portrait, Family portrait, Document, Newspaper clipping, Drawing, Painting, Selfie, Gravestone)",
  "estimated_date": "string — be as accurate as possible (decade, year, or full date). Use clothing, hairstyles, technology, EXIF, filename.",
  "location": "string (estimated location or 'Unknown')",
  "subjects": [
    {
      "label": "string (e.g. Subject1, unique per subject)",
      "bounding_box": { "x": number, "y": number, "width": number, "height": number },
      "type": "person | pet",
      "location_desc": "string (e.g. '2nd from left')",
      "gender": "male | female | other",
      "animal_type": "string (for pets)",
      "age_range": "string",
      "dob_range": "string (estimated birth decade or range)",
      "emotion": "string",
      "gaze": "string",
      "features": "string (distinctive features)",
      "uniform": "string (if applicable)"
    }
  ],
  "caption": "string (descriptive, using subject labels)",
  "keywords": ["string"],
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

export function buildGeminiFlashPrompt({ filename, exifDataString, imageStrategy }: GeminiPromptInput): string {
    return `You are a photo archivist. Analyse this image and return ONLY valid JSON.

Context:
- Filename: ${filename}
- EXIF Data: ${exifDataString || 'none'}
${buildImagePartInstructions(imageStrategy)}

Return JSON matching this schema exactly (no extra keys):
{
  "type": "string (Landscape, Group portrait, Family portrait, Document, Selfie, etc.)",
  "estimated_date": "string (decade or year — use EXIF, clothing, hairstyles)",
  "location": "string (estimated location or 'Unknown')",
  "subjects": [
    {
      "label": "string (Subject1, Subject2, etc.)",
      "bounding_box": { "x": number, "y": number, "width": number, "height": number },
      "type": "person | pet",
      "location_desc": "string (e.g. 'centre', '2nd from left')",
      "gender": "male | female | other",
      "age_range": "string",
      "emotion": "string"
    }
  ],
  "caption": "string",
  "keywords": ["string"],
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
