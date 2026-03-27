# Photo Metadata Evidence And Resolution Design

**Date:** 2026-03-27

## Goal

Replace the current single-row AI metadata model with a first-class photo metadata evidence system that:

- stores multiple machine-produced metadata blocks per asset
- stores sparse, attributed manual metadata assertions per asset
- resolves a field-by-field best current view locally without relying on external AI for business logic
- exposes fast SQL-friendly fields for normal gallery and single-photo queries
- keeps richer evidence, disagreement, and provenance available on demand

## Why

The current `ai_metadata` flow assumes one latest answer is the answer. That is already limiting, and it will become more limiting as the app gains:

- a Flash scout pass and a Pro refinement pass
- stronger region-of-interest workflows
- richer manual corrections from multiple users
- future enrichment providers with different strengths

This design treats AI responses, manual knowledge, and local derivations as evidence sources instead of as one mutable blob.

## Constraints And Decisions

- No backwards compatibility or migration work is required.
- Resolution logic must remain local and deterministic.
- Sensitive-content logic and similar local-only decisions must not depend on external AI.
- V1 supports field-by-field preference, not whole-block preference only.
- Newest manual assertion wins for the specific field it edits.
- Manual edits are sparse assertions, not full replacement metadata blocks.
- Machine enrichment results are stored as full metadata blocks.
- Most of the product should read the resolved best current view.
- Raw competing opinions should be fetched only when the user explicitly asks for them.
- `photo_created_at` remains a local derived value built from signals, not a direct copy of one metadata block.
- The workflow module may remain as an orchestration trigger, but the real metadata and date-resolution logic should live in core domain services.

## User Outcomes

### Default Experience

For most screens, the user sees a single best current view of the photo metadata:

- concise caption
- fuller description
- estimated location
- estimated date range and label
- resolved subjects
- keywords and other standard metadata

### Explainability

When the user wants more detail, the app can show:

- which source supplied each displayed field
- whether a field came from Flash scout, Pro refinement, or a manual edit
- who entered a manual assertion
- what competing opinions exist for the same field

### Incremental Improvement

Folder ingest can use a lower-cost scout model, while hand-picked photos can receive a more expensive refinement pass later without changing the rest of the app's contract.

## Metadata Model

Promote the current Gemini-specific response shape into a broader domain-level schema such as `PhotoMetadataBlock`.

This schema should be valid for machine-generated metadata and for the resolved best current view.

### Standard Fields

The standard metadata block should support at least:

- `type`
- `caption`
- `description`
- `location`
- `estimated_date`
- `subjects`
- `keywords`
- `emotional_impact`
- `quality`
- `recommended_enhancements`
- `authenticity`
- `suggested_names`
- source and provenance metadata outside the field payload itself

### `estimated_date`

Replace the current free-text-only date field with a structured object:

```json
{
  "most_likely_date": "ISO date or null",
  "min_date": "ISO date or null",
  "max_date": "ISO date or null",
  "display_label": "string, e.g. 'late 1970s'",
  "rationale": "string"
}
```

This still allows exact dates when evidence is unusually strong, while supporting the more common decade-or-range output.

### `caption` And `description`

- `caption` is a short one-line summary suitable for gallery overlays and quick scanning
- `description` is the richer narrative version for the single-photo view

### Subjects

Subject entries should use one stable shared shape across scout and refined passes. Fields that are weaker or unknown in the scout pass should still exist and be nullable instead of disappearing from the schema.

Expected subject fields:

- `label`
- `bounding_box`
- `type`
- `location_desc`
- `gender`
- `animal_type`
- `age_range`
- `dob_range`
- `emotion`
- `gaze`
- `features`
- `uniform`
- `suggested_names`

### Regions Of Interest

Machine scout output should also support a first-class `regions_of_interest` collection for non-subject clues such as:

- signage
- written notes
- gravestone text
- uniforms or insignia
- vehicles
- architectural details
- studio marks

ROI data should remain separate from `subjects` so the model does not overload person detection with every useful clue in the image.

## Prompt And Schema Alignment

All machine prompts and response schemas should request the same standard field set.

The difference between scout and refined passes should be reasoning depth and image inputs, not a different shape.

### Prompt Guidance Improvements

Both scout and refined prompts should define field expectations more tightly:

- `caption`: short one-line summary
- `description`: fuller narrative summary
- `location`: use `Unknown` when evidence is weak rather than over-guessing
- `estimated_date`: provide structured date range plus display label
- `gender`: allow `unknown`; do not force a guess
- `keywords`: prefer archival keywords over generic filler
- `quality` and `authenticity.score`: define the expected numeric range explicitly
- `bounding_box`: define coordinate system clearly
- `suggested_names`: allow filename or contextual hints when evidence is meaningful

The current drift between Flash and Pro prompt/schema/type definitions should be removed entirely.

## Storage Model

Use a hybrid relational model.

### 1. `photo_metadata_blocks`

One row per machine-produced metadata block.

Suggested fields:

- `id`
- `asset_id`
- `source_kind`
- `provider`
- `model_version`
- `schema_version`
- `block_json`
- `created_at`

Example `source_kind` values:

- `gemini_flash_scout`
- `gemini_pro_refined`

### 2. `photo_metadata_assertions`

One row per sparse manual assertion.

Suggested fields:

- `id`
- `asset_id`
- `field_path`
- `value_json`
- `user_id`
- `note`
- `created_at`

This model supports sparse edits naturally and preserves attribution such as "my father-in-law entered this."

### 3. `photo_metadata_projection`

One row per asset containing the resolved best current view for query-hot fields.

Suggested fields:

- `asset_id`
- `caption`
- `description`
- `type`
- `location`
- `estimated_date_most_likely`
- `estimated_date_min`
- `estimated_date_max`
- `estimated_date_label`
- `keywords_json`
- provenance columns for displayed fields such as `caption_source_kind`, `caption_source_id`

This table is the fast path for normal gallery and single-photo queries.

### 4. Optional Child Tables

If needed for query-heavy UI or overlays, add relational children for structured repeated data such as:

- `photo_metadata_subjects`
- `photo_metadata_regions_of_interest`

These should be derived from the resolved projection or from specific blocks depending on the use case.

## Resolution Model

Resolution happens locally in core logic, not in the workflow module and not in an external AI call.

When an asset receives any new metadata evidence, the resolver recomputes its best current view.

Triggers include:

- new scout block
- new refined block
- new manual assertion
- future local or external enrichment sources

### Field-By-Field Precedence

V1 resolution rules:

1. newest manual assertion wins for that field
2. otherwise prefer refined AI over scout AI
3. otherwise use the best available machine value

Fields resolve independently. A single asset may end up with:

- caption from Pro
- location from a manual assertion
- suggested names from Flash scout

### Provenance

For every resolved field, store enough information to explain:

- what source won
- what record it came from
- what other opinions exist if requested later

## Date Estimation

`photo_created_at` should remain a local derived field.

Do not treat one metadata block as the final answer. Instead, feed all relevant signals into the date estimator:

- embedded metadata
- filename hints
- machine metadata blocks
- manual date assertions

The date estimator should continue to produce:

- resolved `photo_created_at`
- confidence score
- explanation payload or signal list

The current workflow module can remain as a thin trigger, but the real logic should move into core metadata resolution services.

## Workflow And Runtime Shape

### Folder Ingest

Folder ingest should default to a scout-oriented machine pass:

- use Flash
- return the standard metadata block
- include regions of interest
- persist the scout block as a first-class artifact

### Manual / Selected-Photo Flow

The manual selected-subject workflow should support passes 2 and 3:

1. read existing scout output or create it if missing
2. crop high-resolution ROIs from the original image
3. call the refined model with overview plus ROI crops
4. persist the refined block
5. rerun local projection and date resolution

### Image Preparation

The current deterministic tiling experiment can evolve into model-guided ROI extraction:

- scout model identifies image taxonomy and ROIs
- local code validates and crops the ROIs
- refined model receives overview plus ROI crops

## Query And UI Behavior

### Default Queries

Normal asset queries should primarily read from:

- `assets`
- `photo_metadata_projection`

This keeps common list/detail requests SQL-friendly and avoids JSON parsing on hot paths.

### Deep Inspection

When the user explicitly asks to inspect evidence, load:

- machine metadata blocks
- manual assertions
- provenance details

### Single-Photo View

The single-photo view should prefer resolved projection data by default, while exposing:

- winning source per field
- refinement status
- manual authorship where relevant
- optional evidence drill-down

## Error Handling

- Invalid machine metadata should fail validation and not silently overwrite the projection.
- Invalid field paths in manual assertions should fail clearly.
- ROI coordinates must be validated locally before crop extraction.
- Sensitive or local-only workflows must not depend on external metadata blocks to make safety decisions.

## Testing Strategy

Add coverage for:

- shared schema alignment between scout and refined prompt/schema/type definitions
- persistence of scout blocks and refined blocks
- persistence of sparse manual assertions with authorship
- field-by-field resolver precedence
- provenance storage for resolved fields
- date estimation using multiple metadata evidence sources
- SQL-first asset payload queries reading projection fields
- on-demand loading of competing opinions

## Out Of Scope For This Slice

- multi-user permissions or auth model design
- synchronization between devices or accounts
- collaborative conflict-resolution UX beyond newest-manual-wins
- externalized policy engines for metadata resolution

## Recommended Implementation Shape

Implement this as a small metadata platform inside the app:

1. global metadata schema and validators
2. machine block persistence
3. manual assertion persistence
4. local resolver for projection and provenance
5. local date-resolution service using all available signals
6. workflow adapters that trigger recomputation rather than owning the logic

This gives the product a stable base for:

- Flash scout ingest
- Pro refinement on selected photos
- manual family knowledge capture
- future enrichment providers
- explainable best-current-view metadata
