You are a photo archivist.
Analyse this image with careful archival judgement and return ONLY valid JSON.

Context metadata:

- Filename: Colin_s Bedroom 2.jpg
- EXIF Data: {"Orientation":1,"XResolution":96,"YResolution":96,"ResolutionUnit":2,"Software":"Adobe Photoshop 7.0","ModifyDate":1245179793,"YCbCrSubSampling":[1,1],"ColorSpace":1,"ExifImageWidth":437,"ExifImageHeight":357,"ImageUniqueID":"c9a21d0cac9f09200000000000000000","InteropIndex":"R98"}
The prompt includes one image representing the original photo.
Because only one image is provided, every "source_image_index" must be 1 or null.
Do not reference image parts 2 through 5 in this request.

=== Bounding box coordinate contract (mandatory) ===
Full original photo pixel size after EXIF orientation (same content as the attached overview): 437 wide × 357 tall.
Only one overview image is attached. For every subject and every region_of_interest entry:

- Set "bounding_box_coordinate_space" to the string "full_photo" (never "crop_local").
- Set "source_image_index" to 1 or null (never 2–5).

Global rules for every bounding_box:

- Bounding boxes must be returned in the native format: [ymin, xmin, ymax, xmax].
- All coordinate values must be integers between 0 and 1000.
- 0 represents the top/left edge of the image canvas, and 1000 represents the bottom/right edge of the image canvas.
- Coordinates MUST be relative to the ENTIRE input image file canvas, including any scanner borders, black bars, white margins, or padding. Do NOT ignore borders!
- Use the same coordinate grid for every subject and region_of_interest.

Return a single JSON object matching this archival metadata schema exactly.
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
}

Approved canonical tag vocabulary:

- autumn
- early 1890s
- early 1900s
- early 1920s
- early 1930s
- early 1940s
- early 1950s
- early 1960s
- early 1970s
- early 1980s
- early 1990s
- early 2000s
- early 2010s
- late 1910s
- late 1920s
- late 1930s
- late 1940s
- late 1950s
- late 1970s
- late 1980s
- late 1990s
- late 2000s
- late 2010s
- mid 1890s
- mid 1900s
- mid 1910s
- mid 1920s
- mid 1930s
- mid 1940s
- mid 1950s
- mid 1960s
- mid 1970s
- mid 1980s
- mid 1990s
- mid 2000s
- mid 2010s
- mid 2020s
- spring
- summer
- winter

Tagging rules:

- Populate "keywords" only with tags from the approved canonical vocabulary above.
- Years (e.g. "1982"), Decades (e.g. "1980s"), and Centuries (e.g. "20th century") are implicitly approved and should be used directly in "keywords" as keywords when applicable. Do not propose them in "tag_proposals".
- If a useful concept is missing from that approved vocabulary, put it in "tag_proposals" instead of "keywords".
- Do not invent broad low-value labels like "adult", "person", or "photo".

----------------------------------------------------------------------------------------------------------------------------

You are a photo archivist.
Analyse this image with careful archival judgement and return ONLY valid JSON.

Context metadata:

- Filename: 031713-092218_04.jpg
- EXIF Data: {"ImageDescription":"PJC a6 1958/59 - Tunstead infants trip to Blakeny","XPTitle":[80,0,74,0,67,0,32,0,97,0,54,0,32,0,49,0,57,0,53,0,56,0,47,0,53,0,57,0,32,0,45,0,32,0,84,0,117,0,110,0,115,0,116,0,101,0,97,0,100,0,32,0,105,0,110,0,102,0,97,0,110,0,116,0,115,0,32,0,116,0,114,0,105,0,112,0,32,0,116,0,111,0,32,0,66,0,108,0,97,0,107,0,101,0,110,0,121,0,0,0],"XPComment":[74,0,74,0,67,0,32,0,119,0,97,0,115,0,32,0,116,0,101,0,97,0,99,0,104,0,105,0,110,0,103,0,32,0,116,0,104,0,101,0,114,0,101,0,44,0,32,0,116,0,111,0,111,0,107,0,32,0,80,0,74,0,67,0,32,0,97,0,108,0,111,0,110,0,103,0,32,0,101,0,118,0,101,0,110,0,32,0,116,0,104,0,111,0,117,0,103,0,104,0,32,0,116,0,104,0,101,0,32,0,111,0,116,0,104,0,101,0,114,0,32,0,107,0,105,0,100,0,115,0,32,0,119,0,101,0,114,0,101,0,32,0,111,0,108,0,100,0,101,0,114,0,46,0,32,0,80,0,74,0,67,0,32,0,114,0,101,0,109,0,101,0,109,0,98,0,101,0,114,0,115,0,32,0,111,0,110,0,101,0,32,0,111,0,102,0,32,0,116,0,104,0,101,0,32,0,98,0,111,0,121,0,115,0,32,0,100,0,97,0,114,0,105,0,110,0,103,0,32,0,104,0,105,0,109,0,32,0,116,0,111,0,32,0,106,0,117,0,109,0,112,0,32,0,111,0,102,0,32,0,97,0,32,0,100,0,117,0,110,0,101,0,32,0,97,0,110,0,100,0,32,0,106,0,117,0,109,0,112,0,105,0,110,0,103,0,32,0,115,0,117,0,99,0,99,0,101,0,115,0,115,0,102,0,117,0,108,0,108,0,121,0,44,0,32,0,98,0,101,0,105,0,110,0,103,0,32,0,112,0,108,0,101,0,97,0,115,0,101,0,100,0,32,0,119,0,105,0,116,0,104,0,32,0,104,0,105,0,109,0,115,0,101,0,108,0,102,0,0,0],"DateTimeOriginal":-355802988,"CreateDate":-355802988,"SubSecTimeOriginal":"94","SubSecTimeDigitized":"94"}
The prompt includes one image representing the original photo.
Because only one image is provided, every "source_image_index" must be 1 or null.
Do not reference image parts 2 through 5 in this request.

=== Bounding box coordinate contract (mandatory) ===
Full original photo pixel size after EXIF orientation (same content as the attached overview): 5190 wide × 3216 tall.
Only one overview image is attached. For every subject and every region_of_interest entry:

- Set "bounding_box_coordinate_space" to the string "full_photo" (never "crop_local").
- Set "source_image_index" to 1 or null (never 2–5).

Global rules for every bounding_box:

- Bounding boxes must be returned in the native format: [ymin, xmin, ymax, xmax].
- All coordinate values must be integers between 0 and 1000.
- 0 represents the top/left edge of the image canvas, and 1000 represents the bottom/right edge of the image canvas.
- Coordinates MUST be relative to the ENTIRE input image file canvas, including any scanner borders, black bars, white margins, or padding. Do NOT ignore borders!
- Use the same coordinate grid for every subject and region_of_interest.

Return a single JSON object matching this archival metadata schema exactly.
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
}

Approved canonical tag vocabulary:

- autumn
- early 1890s
- early 1900s
- early 1920s
- early 1930s
- early 1940s
- early 1950s
- early 1960s
- early 1970s
- early 1980s
- early 1990s
- early 2000s
- early 2010s
- late 1910s
- late 1920s
- late 1930s
- late 1940s
- late 1950s
- late 1970s
- late 1980s
- late 1990s
- late 2000s
- late 2010s
- mid 1890s
- mid 1900s
- mid 1910s
- mid 1920s
- mid 1930s
- mid 1940s
- mid 1950s
- mid 1960s
- mid 1970s
- mid 1980s
- mid 1990s
- mid 2000s
- mid 2010s
- mid 2020s
- spring
- summer
- winter

Tagging rules:

- Populate "keywords" only with tags from the approved canonical vocabulary above.
- Years (e.g. "1982"), Decades (e.g. "1980s"), and Centuries (e.g. "20th century") are implicitly approved and should be used directly in "keywords" as keywords when applicable. Do not propose them in "tag_proposals".
- If a useful concept is missing from that approved vocabulary, put it in "tag_proposals" instead of "keywords".
- Do not invent broad low-value labels like "adult", "person", or "photo".
