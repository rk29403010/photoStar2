# Photo Metadata Evidence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single latest-`ai_metadata` model with a field-resolved metadata evidence system that supports Flash scout blocks, Pro refined blocks, sparse attributed manual assertions, SQL-friendly best-current-view queries, and local date resolution.

**Architecture:** Introduce a global photo metadata domain model and store machine results as full metadata blocks while storing manual edits as sparse field assertions. Add a local resolver that recomputes a query-friendly projection and provenance after every metadata change, then route workflows, queries, and the single-photo UI through that projection while keeping deeper evidence fetches on demand.

**Tech Stack:** TypeScript, Node.js, better-sqlite3, React 19, workflow runtime modules, SQLite schema updates, existing Gemini integration, existing photo date estimator

---

## Chunk 1: Establish The Metadata Domain And Persistence Shape

### Task 1: Add the global metadata domain model

**Files:**

- Create: `src/services/photoMetadata/types.ts`
- Create: `src/services/photoMetadata/fieldPaths.ts`
- Create: `src/services/photoMetadata/validation.ts`
- Modify: `src/services/aiMetadata/geminiTypes.ts`
- Test: `tests/core/photo-metadata-types.test.cjs`

- [ ] **Step 1: Write the failing metadata-domain tests**

Create `tests/core/photo-metadata-types.test.cjs` covering:

- shared `PhotoMetadataBlock` shape includes `caption` and `description`
- `estimated_date` is structured and not plain text
- `suggested_names` is available in subjects for all machine tiers
- ROI entries are represented separately from subjects

Run: `node.exe --test tests/core/photo-metadata-types.test.cjs`
Expected: FAIL because the new domain types and validators do not exist yet.

- [ ] **Step 2: Define the global metadata types**

Create `src/services/photoMetadata/types.ts` with the stable shared model:

```ts
export interface PhotoMetadataEstimatedDate {
    most_likely_date: string | null;
    min_date: string | null;
    max_date: string | null;
    display_label: string;
    rationale: string | null;
}

export interface PhotoMetadataSubject {
    label: string;
    bounding_box: { x: number; y: number; width: number; height: number };
    type: 'person' | 'pet';
    location_desc: string;
    gender: string | null;
    animal_type: string | null;
    age_range: string | null;
    dob_range: string | null;
    emotion: string | null;
    gaze: string | null;
    features: string | null;
    uniform: string | null;
    suggested_names: string[];
}

export interface PhotoMetadataRegionOfInterest {
    label: string;
    kind: string;
    bounding_box: { x: number; y: number; width: number; height: number };
    significance: string | null;
}

export interface PhotoMetadataBlock {
    type: string;
    caption: string;
    description: string;
    location: string;
    estimated_date: PhotoMetadataEstimatedDate;
    subjects: PhotoMetadataSubject[];
    regions_of_interest: PhotoMetadataRegionOfInterest[];
    keywords: string[];
    emotional_impact: string;
    quality: {
        technical: number;
        lighting: number;
        composition: number;
        emotional: number;
        discard: boolean;
    };
    recommended_enhancements: string[];
    authenticity: {
        score: number;
        reasons: string[];
    };
}
```

- [ ] **Step 3: Add field-path helpers for manual assertions**

Create `src/services/photoMetadata/fieldPaths.ts` with explicit allowed paths and helpers such as:

- `caption`
- `description`
- `location`
- `estimated_date.display_label`
- `estimated_date.most_likely_date`

Do not make field paths free-form in V1.

- [ ] **Step 4: Add validation helpers**

Create `src/services/photoMetadata/validation.ts` with small runtime guards for:

- block shape validation
- assertion field-path validation
- ISO date/null handling for structured date fields

- [ ] **Step 5: Point legacy Gemini-specific types at the new domain model**

Modify `src/services/aiMetadata/geminiTypes.ts` so Gemini runtime code uses the new domain types instead of owning a divergent shape.

- [ ] **Step 6: Run the focused test**

Run: `node.exe --test tests/core/photo-metadata-types.test.cjs`
Expected: PASS

- [ ] **Step 7: Run staged fast checks for touched files**

Run: `npm.cmd run quality:staged`
Expected: PASS for the new metadata-domain files and test.

- [ ] **Step 8: Commit the domain model**

```bash
git add src/services/photoMetadata/types.ts src/services/photoMetadata/fieldPaths.ts src/services/photoMetadata/validation.ts src/services/aiMetadata/geminiTypes.ts tests/core/photo-metadata-types.test.cjs
git commit -m "feat: add shared photo metadata domain model"
```

### Task 2: Add metadata evidence tables and projection storage

**Files:**

- Modify: `src/data/dbSchema.ts`
- Create: `src/services/photoMetadata/repository.ts`
- Test: `tests/core/photo-metadata-repository.test.cjs`

- [ ] **Step 1: Write the failing repository test**

Create `tests/core/photo-metadata-repository.test.cjs` covering:

- insert machine metadata block
- insert manual assertion with `user_id` and `note`
- upsert projection row
- provenance fields persist correctly

Run: `node.exe --test tests/core/photo-metadata-repository.test.cjs`
Expected: FAIL because the tables and repository do not exist.

- [ ] **Step 2: Extend the schema**

Modify `src/data/dbSchema.ts` to add:

- `photo_metadata_blocks`
- `photo_metadata_assertions`
- `photo_metadata_projection`
- useful indexes by `asset_id`, `source_kind`, `field_path`, `created_at`

Keep query-hot projection columns relational, not buried in JSON.

- [ ] **Step 3: Implement the repository**

Create `src/services/photoMetadata/repository.ts` with methods like:

- `insertMetadataBlock(...)`
- `insertManualAssertion(...)`
- `listBlocksForAsset(assetId)`
- `listAssertionsForAsset(assetId)`
- `saveProjection(...)`
- `loadProjection(assetId)`

- [ ] **Step 4: Run the repository test**

Run: `node.exe --test tests/core/photo-metadata-repository.test.cjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 6: Commit the persistence layer**

```bash
git add src/data/dbSchema.ts src/services/photoMetadata/repository.ts tests/core/photo-metadata-repository.test.cjs
git commit -m "feat: add photo metadata evidence storage"
```

## Chunk 2: Unify Scout And Refined Machine Metadata

### Task 3: Align Gemini prompts and response schemas to the shared block

**Files:**

- Modify: `src/services/aiMetadata/geminiPrompts.ts`
- Modify: `src/services/aiMetadata/geminiResponseSchema.ts`
- Test: `tests/core/runtime-ai-metadata-prompt.test.cjs`
- Create: `tests/core/runtime-ai-metadata-schema.test.cjs`

- [ ] **Step 1: Write failing schema-alignment tests**

Add tests that assert:

- Flash and Pro request the same top-level fields
- both include `caption`, `description`, `estimated_date`, `regions_of_interest`
- both include `suggested_names`, `uniform`, `features`, `gaze`, `dob_range`, `animal_type` in subjects

Run:

- `node.exe --test tests/core/runtime-ai-metadata-prompt.test.cjs`
- `node.exe --test tests/core/runtime-ai-metadata-schema.test.cjs`

Expected: FAIL because the current Flash prompt/schema omits richer fields.

- [ ] **Step 2: Rewrite the prompt contracts**

Update `src/services/aiMetadata/geminiPrompts.ts` so both prompts:

- request the same block shape
- define `caption` as short and `description` as fuller
- define `estimated_date` as structured range + label
- request ROI output in both tiers
- keep `suggested_names` in both tiers

Use stronger wording around uncertainty and archival consistency.

- [ ] **Step 3: Align the generated response schema**

Update `src/services/aiMetadata/geminiResponseSchema.ts` so Flash and Pro share one schema builder with only optional metadata about tier, not field shape.

- [ ] **Step 4: Run prompt/schema tests**

Run:

- `node.exe --test tests/core/runtime-ai-metadata-prompt.test.cjs`
- `node.exe --test tests/core/runtime-ai-metadata-schema.test.cjs`

Expected: PASS

- [ ] **Step 5: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 6: Commit the prompt/schema alignment**

```bash
git add src/services/aiMetadata/geminiPrompts.ts src/services/aiMetadata/geminiResponseSchema.ts tests/core/runtime-ai-metadata-prompt.test.cjs tests/core/runtime-ai-metadata-schema.test.cjs
git commit -m "feat: align scout and refined metadata schemas"
```

### Task 4: Persist machine metadata as evidence blocks instead of a single winning blob

**Files:**

- Modify: `src/services/aiMetadata/liveRuntime.ts`
- Modify: `src/services/workflowRuntime/modules/generateAiMetadataModule.ts`
- Create: `tests/core/photo-metadata-machine-blocks.test.cjs`

- [ ] **Step 1: Write the failing machine-block persistence test**

Cover:

- Flash scout persists a `gemini_flash_scout` block
- Pro refinement persists a `gemini_pro_refined` block
- runtime no longer relies on overwriting one `derived_results.ai_metadata` record

Run: `node.exe --test tests/core/photo-metadata-machine-blocks.test.cjs`
Expected: FAIL

- [ ] **Step 2: Split runtime result handling by source kind**

Update `src/services/aiMetadata/liveRuntime.ts` to:

- emit shared `PhotoMetadataBlock` data
- tag scout vs refined outputs explicitly
- persist through the new metadata repository
- keep Pro-pending state if needed, but do not treat it as the only metadata state

- [ ] **Step 3: Update the workflow module adapter**

Modify `src/services/workflowRuntime/modules/generateAiMetadataModule.ts` so it:

- triggers machine block persistence
- triggers local metadata resolution afterward
- still returns a workflow artifact for orchestration visibility

- [ ] **Step 4: Run the focused test**

Run: `node.exe --test tests/core/photo-metadata-machine-blocks.test.cjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run:

- `npm.cmd run lint:fast:staged`
- `npm.cmd run complexity:staged`
- `npm.cmd run quality:staged`

Expected: PASS

- [ ] **Step 6: Commit machine-block persistence**

```bash
git add src/services/aiMetadata/liveRuntime.ts src/services/workflowRuntime/modules/generateAiMetadataModule.ts tests/core/photo-metadata-machine-blocks.test.cjs
git commit -m "feat: persist scout and refined metadata blocks"
```

## Chunk 3: Add Manual Assertions And Local Resolution

### Task 5: Add sparse attributed manual metadata assertions

**Files:**

- Create: `src/services/photoMetadata/manualAssertions.ts`
- Modify: `src/boundary/contracts/core.ts`
- Modify: `src/services/handlers/systemCommands.ts`
- Create: `tests/core/photo-metadata-manual-assertions.test.cjs`

- [ ] **Step 1: Write the failing manual-assertion tests**

Cover:

- creating a manual assertion for a single field
- recording `user_id` and optional note
- newest manual assertion wins for that field
- non-overridden fields remain machine-derived

Run: `node.exe --test tests/core/photo-metadata-manual-assertions.test.cjs`
Expected: FAIL

- [ ] **Step 2: Add the assertion service**

Create `src/services/photoMetadata/manualAssertions.ts` with methods like:

- `recordManualAssertion(...)`
- `listManualAssertions(...)`

- [ ] **Step 3: Add boundary contract support**

Modify `src/boundary/contracts/core.ts` to include types for:

- projection metadata fields
- optional provenance summary
- optional evidence payloads when requested

- [ ] **Step 4: Add a command path for manual assertions**

Modify `src/services/handlers/systemCommands.ts` or the appropriate command surface to accept manual metadata edits with:

- `assetId`
- `fieldPath`
- `value`
- `userId`
- `note`

- [ ] **Step 5: Run the focused test**

Run: `node.exe --test tests/core/photo-metadata-manual-assertions.test.cjs`
Expected: PASS

- [ ] **Step 6: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 7: Commit manual assertions**

```bash
git add src/services/photoMetadata/manualAssertions.ts src/boundary/contracts/core.ts src/services/handlers/systemCommands.ts tests/core/photo-metadata-manual-assertions.test.cjs
git commit -m "feat: add manual metadata assertions"
```

### Task 6: Add the field-by-field resolver and projection writer

**Files:**

- Create: `src/services/photoMetadata/resolver.ts`
- Modify: `src/services/photoMetadata/repository.ts`
- Create: `tests/core/photo-metadata-resolver.test.cjs`

- [ ] **Step 1: Write the failing resolver tests**

Cover:

- manual wins for the specific field it edits
- refined AI beats scout AI when no manual override exists
- fields resolve independently
- provenance for winning fields is stored with source kind and source id

Run: `node.exe --test tests/core/photo-metadata-resolver.test.cjs`
Expected: FAIL

- [ ] **Step 2: Implement the resolver**

Create `src/services/photoMetadata/resolver.ts` with a pure service that:

- loads blocks and assertions
- applies precedence rules
- produces a projection payload
- returns provenance alongside field values

Keep the precedence logic explicit and boring.

- [ ] **Step 3: Save the projection through the repository**

Extend `src/services/photoMetadata/repository.ts` so resolver output can be persisted in `photo_metadata_projection`.

- [ ] **Step 4: Run the focused resolver test**

Run: `node.exe --test tests/core/photo-metadata-resolver.test.cjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run:

- `npm.cmd run lint:fast:staged`
- `npm.cmd run complexity:staged`
- `npm.cmd run quality:staged`

Expected: PASS

- [ ] **Step 6: Commit the resolver**

```bash
git add src/services/photoMetadata/resolver.ts src/services/photoMetadata/repository.ts tests/core/photo-metadata-resolver.test.cjs
git commit -m "feat: resolve metadata evidence into projection fields"
```

## Chunk 4: Move Date Resolution Into Core Metadata Logic

### Task 7: Broaden date estimation to consume metadata evidence

**Files:**

- Modify: `src/services/photoDateEstimate.ts`
- Create: `src/services/photoMetadata/dateResolver.ts`
- Create: `tests/core/photo-metadata-date-resolution.test.cjs`

- [ ] **Step 1: Write the failing date-resolution tests**

Cover:

- date estimation accepts structured machine date signals
- manual date assertions participate as signals
- output still writes `photo_created_at` plus confidence
- disagreement across evidence sources lowers confidence

Run: `node.exe --test tests/core/photo-metadata-date-resolution.test.cjs`
Expected: FAIL

- [ ] **Step 2: Extract a metadata-aware date resolver**

Create `src/services/photoMetadata/dateResolver.ts` that:

- gathers date signals from machine blocks, manual assertions, embedded metadata, and filenames
- delegates final range/confidence computation to the existing date-estimation logic where sensible

- [ ] **Step 3: Adapt `photoDateEstimate.ts`**

Modify `src/services/photoDateEstimate.ts` to work with structured date evidence rather than only a plain `estimated_date` string buried in one AI blob.

- [ ] **Step 4: Run the focused date tests**

Run: `node.exe --test tests/core/photo-metadata-date-resolution.test.cjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 6: Commit the date-resolution service**

```bash
git add src/services/photoDateEstimate.ts src/services/photoMetadata/dateResolver.ts tests/core/photo-metadata-date-resolution.test.cjs
git commit -m "feat: resolve photo dates from metadata evidence"
```

### Task 8: Keep the workflow module as a thin adapter

**Files:**

- Modify: `src/services/workflowRuntime/modules/estimatePhotoDateModule.ts`
- Create: `tests/core/photo-metadata-date-module.test.cjs`

- [ ] **Step 1: Write the failing adapter test**

Cover:

- workflow module delegates to core date-resolution service
- workflow module no longer owns the signal-selection logic
- projection/date recomputation updates `assets.photo_created_at`

Run: `node.exe --test tests/core/photo-metadata-date-module.test.cjs`
Expected: FAIL

- [ ] **Step 2: Thin down the workflow module**

Modify `src/services/workflowRuntime/modules/estimatePhotoDateModule.ts` so it:

- loads relevant evidence through the repository/resolver service
- calls the core date resolver
- persists the derived result artifact and asset fields

- [ ] **Step 3: Run the adapter test**

Run: `node.exe --test tests/core/photo-metadata-date-module.test.cjs`
Expected: PASS

- [ ] **Step 4: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 5: Commit the adapter change**

```bash
git add src/services/workflowRuntime/modules/estimatePhotoDateModule.ts tests/core/photo-metadata-date-module.test.cjs
git commit -m "refactor: move date logic behind core metadata resolver"
```

## Chunk 5: Switch Queries And UI To The Resolved Projection

### Task 9: Update asset queries to use projection rows instead of parsing one AI blob

**Files:**

- Modify: `src/services/handlers/assetCommands.ts`
- Modify: `src/services/handlers/assetPayloadModel.ts`
- Modify: `src/shared/sql/derivedResults.ts`
- Create: `tests/core/asset-metadata-projection-selection.test.cjs`

- [ ] **Step 1: Write the failing query-selection tests**

Cover:

- asset list/detail reads `caption`, `description`, `location`, date label, and metadata provenance from projection tables
- default queries do not need to parse machine metadata blocks
- legacy single-blob `ai_metadata` assumptions are removed from the common path

Run: `node.exe --test tests/core/asset-metadata-projection-selection.test.cjs`
Expected: FAIL

- [ ] **Step 2: Add projection joins**

Modify `src/services/handlers/assetCommands.ts` to join `photo_metadata_projection` for full and gallery paths.

- [ ] **Step 3: Update payload assembly**

Modify `src/services/handlers/assetPayloadModel.ts` so the returned asset shape prefers projection fields and only attaches deep evidence when specifically requested.

- [ ] **Step 4: Trim obsolete latest-derived-result helpers where appropriate**

Modify `src/shared/sql/derivedResults.ts` only if helper usage becomes misleading or dead after projection joins replace latest-blob lookups.

- [ ] **Step 5: Run the query-selection test**

Run: `node.exe --test tests/core/asset-metadata-projection-selection.test.cjs`
Expected: PASS

- [ ] **Step 6: Run fast checks**

Run:

- `npm.cmd run lint:fast:staged`
- `npm.cmd run complexity:staged`
- `npm.cmd run quality:staged`

Expected: PASS

- [ ] **Step 7: Commit query changes**

```bash
git add src/services/handlers/assetCommands.ts src/services/handlers/assetPayloadModel.ts src/shared/sql/derivedResults.ts tests/core/asset-metadata-projection-selection.test.cjs
git commit -m "feat: query projected metadata instead of latest ai blob"
```

### Task 10: Update the single-photo UI for best-current-view plus on-demand evidence

**Files:**

- Modify: `src/ui/components/single-photo/info-panel/FileTab.tsx`
- Modify: `src/ui/components/single-photo/info-panel/AnalysisTab.tsx`
- Modify: `src/ui/components/single-photo/info-panel/PeopleTab.tsx`
- Modify: `src/ui/components/single-photo/InfoPanel.tsx`
- Modify: `src/ui/components/SinglePhotoView.tsx`
- Create: `tests/ui/photo-metadata-projection-ui.test.cjs`

- [ ] **Step 1: Write the failing UI model tests**

Cover:

- file/analysis/people tabs render projection-backed metadata
- `caption` and `description` are distinct
- manual authorship and winning-source hints can be shown
- deeper evidence is hidden by default

Run: `node.exe --test tests/ui/photo-metadata-projection-ui.test.cjs`
Expected: FAIL

- [ ] **Step 2: Update the file tab**

Modify `src/ui/components/single-photo/info-panel/FileTab.tsx` to display:

- projection-backed type/location/date summary
- winning source labels
- refinement status if a better machine pass is pending

- [ ] **Step 3: Update the analysis tab**

Modify `src/ui/components/single-photo/info-panel/AnalysisTab.tsx` to use:

- projection-backed `description`
- quality/authenticity from the resolved view
- optional provenance summaries

- [ ] **Step 4: Update the people tab**

Modify `src/ui/components/single-photo/info-panel/PeopleTab.tsx` to read resolved subject fields, including:

- `suggested_names`
- `uniform`
- `features`
- `dob_range`
- subject-level source hints where feasible

- [ ] **Step 5: Add on-demand evidence loading hooks**

Modify `src/ui/components/single-photo/InfoPanel.tsx` and `src/ui/components/SinglePhotoView.tsx` so raw evidence is only requested and rendered when the user opens the deeper evidence view.

- [ ] **Step 6: Run the UI test**

Run: `node.exe --test tests/ui/photo-metadata-projection-ui.test.cjs`
Expected: PASS

- [ ] **Step 7: Run fast checks**

Run:

- `npm.cmd run lint:fast:staged`
- `npm.cmd run complexity:staged`
- `npm.cmd run quality:staged`

Expected: PASS

- [ ] **Step 8: Commit the UI changes**

```bash
git add src/ui/components/single-photo/info-panel/FileTab.tsx src/ui/components/single-photo/info-panel/AnalysisTab.tsx src/ui/components/single-photo/info-panel/PeopleTab.tsx src/ui/components/single-photo/InfoPanel.tsx src/ui/components/SinglePhotoView.tsx tests/ui/photo-metadata-projection-ui.test.cjs
git commit -m "feat: show resolved metadata projection in single photo view"
```

## Chunk 6: Wire Manual Commands, Evidence Fetches, And End-To-End Verification

### Task 11: Add explicit evidence fetches and manual-edit command surfaces

**Files:**

- Modify: `src/services/handlers/systemWorkflowRuntimeCommands.ts`
- Modify: `src/boundary\runtime\usePhotoLibrary.commands.ts`
- Create: `tests/core/photo-metadata-evidence-commands.test.cjs`

- [ ] **Step 1: Write failing command tests**

Cover:

- fetch metadata evidence for one asset on demand
- submit manual metadata assertion with `userId`
- selected-subject Pro refinement still works after the storage redesign

Run: `node.exe --test tests/core/photo-metadata-evidence-commands.test.cjs`
Expected: FAIL

- [ ] **Step 2: Add evidence-fetch commands**

Modify `src/services/handlers/systemWorkflowRuntimeCommands.ts` and/or the appropriate command handler to return:

- projection
- raw machine blocks
- manual assertions
- provenance summaries

- [ ] **Step 3: Add boundary command helpers**

Modify `src/boundary/runtime/usePhotoLibrary.commands.ts` to expose:

- manual assertion submission
- evidence fetch on demand
- selected-photo refinement trigger without relying on the old single-blob assumption

- [ ] **Step 4: Run the focused command test**

Run: `node.exe --test tests/core/photo-metadata-evidence-commands.test.cjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 6: Commit the command surfaces**

```bash
git add src/services/handlers/systemWorkflowRuntimeCommands.ts src/boundary/runtime/usePhotoLibrary.commands.ts tests/core/photo-metadata-evidence-commands.test.cjs
git commit -m "feat: add metadata evidence commands and manual edit flow"
```

### Task 12: Run end-to-end verification and clean up the handoff

**Files:**

- Modify: `docs/module-catalogue.md`
- Modify: `docs/todo.md`

- [ ] **Step 1: Pause any managed dev session before code edits if one is running**

Run: `npm.cmd run dev:pause`
Expected: either a clean pause or a harmless “no active session” style response.

- [ ] **Step 2: Run focused regression tests**

Run the touched suites, for example:

- `node.exe --test tests/core/photo-metadata-types.test.cjs`
- `node.exe --test tests/core/photo-metadata-repository.test.cjs`
- `node.exe --test tests/core/runtime-ai-metadata-prompt.test.cjs`
- `node.exe --test tests/core/runtime-ai-metadata-schema.test.cjs`
- `node.exe --test tests/core/photo-metadata-machine-blocks.test.cjs`
- `node.exe --test tests/core/photo-metadata-manual-assertions.test.cjs`
- `node.exe --test tests/core/photo-metadata-resolver.test.cjs`
- `node.exe --test tests/core/photo-metadata-date-resolution.test.cjs`
- `node.exe --test tests/core/photo-metadata-date-module.test.cjs`
- `node.exe --test tests/core/asset-metadata-projection-selection.test.cjs`
- `node.exe --test tests/core/photo-metadata-evidence-commands.test.cjs`
- `node.exe --test tests/ui/photo-metadata-projection-ui.test.cjs`

Expected: PASS

- [ ] **Step 3: Run the repo fast-loop quality gate**

Run:

- `npm.cmd run quality:staged`
- `npm.cmd run quality`

Expected: PASS

- [ ] **Step 4: Update docs that describe the module/query model**

Modify:

- `docs/module-catalogue.md`
- `docs/todo.md`

Remove stale references to the single latest `ai_metadata` assumption.

- [ ] **Step 5: Resume the managed dev session if it was paused**

Run: `npm.cmd run dev:resume`
Expected: session resumes or reports there was nothing paused.

- [ ] **Step 6: Commit docs and final verification fixes**

```bash
git add docs/module-catalogue.md docs/todo.md
git commit -m "docs: describe metadata evidence architecture"
```

- [ ] **Step 7: Inspect final git state**

Run:

- `git.exe diff --cached --stat`
- `git.exe status --short`

Expected: no unexplained staged or unstaged task files remain.
