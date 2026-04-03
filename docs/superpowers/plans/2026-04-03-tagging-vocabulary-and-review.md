# Tagging Vocabulary And Review Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a controlled tagging system with canonical tags, aliases, assignments, migration of legacy tags, deterministic date tags, manual tagging in single-photo and bulk gallery flows, and a generic review queue that starts with tag proposals.

**Architecture:** Introduce relational tag tables and a generic review-item table in SQLite, then route AI, system, and manual tagging through the same canonical tag model. Keep migration and deterministic date-tag generation in core services, expose manual tagging in the existing gallery and single-photo UI, and use one review queue model for both per-photo tag proposals and a central inbox.

**Tech Stack:** TypeScript, React 19, better-sqlite3, existing SQLite schema and command handlers, existing photo date metadata pipeline, existing library selection and single-photo info panel UI

---

## Chunk 1: Persistence And Domain Foundations

### Task 1: Add canonical tag and review schema support

**Files:**

- Modify: `src/data/dbSchema.ts`
- Create: `src/services/tags/tagTypes.ts`
- Test: `tests/core/tag-schema.test.cjs`

- [ ] **Step 1: Write the failing schema test**

Create `tests/core/tag-schema.test.cjs` covering:

- canonical tag definitions table exists
- tag aliases table exists
- asset tag assignments table exists
- generic review items table exists

Run: `node.exe --test tests/core/tag-schema.test.cjs`
Expected: FAIL because the tables and types do not exist yet.

- [ ] **Step 2: Add the shared tag/review domain types**

Create `src/services/tags/tagTypes.ts` with explicit types for:

- canonical tag definitions
- tag aliases
- asset tag assignments
- review items
- review item statuses and review item types

- [ ] **Step 3: Extend the SQLite schema**

Modify `src/data/dbSchema.ts` to add:

- `tag_definitions`
- `tag_aliases`
- `asset_tag_assignments`
- `review_items`

Include indexes for:

- canonical label lookup
- alias lookup
- asset-to-tag lookup
- tag-to-asset lookup
- review status/type lookup

- [ ] **Step 4: Run the schema test**

Run: `node.exe --test tests/core/tag-schema.test.cjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 6: Commit the schema foundation**

```bash
git add src/data/dbSchema.ts src/services/tags/tagTypes.ts tests/core/tag-schema.test.cjs
git commit -m "feat: add canonical tag and review schema"
```

### Task 2: Add tag repository services

**Files:**

- Create: `src/services/tags/tagRepository.ts`
- Test: `tests/core/tag-repository.test.cjs`

- [ ] **Step 1: Write the failing repository test**

Create `tests/core/tag-repository.test.cjs` covering:

- create canonical tag
- create alias
- assign canonical tag to asset with source kind
- create review item
- query asset tags and pending review items

Run: `node.exe --test tests/core/tag-repository.test.cjs`
Expected: FAIL because the repository does not exist.

- [ ] **Step 2: Implement the repository**

Create `src/services/tags/tagRepository.ts` with methods like:

- `createTagDefinition`
- `createTagAlias`
- `assignTagToAsset`
- `removeTagAssignment`
- `listTagsForAsset`
- `listAssetsForTag`
- `createReviewItem`
- `listReviewItems`

- [ ] **Step 3: Run the repository test**

Run: `node.exe --test tests/core/tag-repository.test.cjs`
Expected: PASS

- [ ] **Step 4: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 5: Commit the repository**

```bash
git add src/services/tags/tagRepository.ts tests/core/tag-repository.test.cjs
git commit -m "feat: add tag repository services"
```

## Chunk 2: Seeding, Migration, And Deterministic Date Tags

### Task 3: Seed the initial approved vocabulary

**Files:**

- Create: `src/services/tags/seedVocabulary.ts`
- Test: `tests/core/tag-vocabulary-seed.test.cjs`

- [ ] **Step 1: Write the failing seed test**

Create `tests/core/tag-vocabulary-seed.test.cjs` covering:

- date tags are seeded
- starter curated tags are seeded
- low-value tags like `adult` are not part of the starter set

Run: `node.exe --test tests/core/tag-vocabulary-seed.test.cjs`
Expected: FAIL because the seeding module does not exist.

- [ ] **Step 2: Implement the seed vocabulary**

Create `src/services/tags/seedVocabulary.ts` with explicit seed data for:

- centuries
- decades
- early/mid/late decade tags
- seasons
- starter curated tags like `portrait`, `group photo`, `family`, `affection`, `travel`, `document`

- [ ] **Step 3: Run the seed test**

Run: `node.exe --test tests/core/tag-vocabulary-seed.test.cjs`
Expected: PASS

- [ ] **Step 4: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 5: Commit the vocabulary seed**

```bash
git add src/services/tags/seedVocabulary.ts tests/core/tag-vocabulary-seed.test.cjs
git commit -m "feat: seed canonical tag vocabulary"
```

### Task 4: Add legacy tag inventory and migration helpers

**Files:**

- Create: `src/services/tags/legacyTagMigration.ts`
- Modify: `src/services/handlers/assetPayloadModel.ts`
- Test: `tests/core/legacy-tag-migration.test.cjs`

- [ ] **Step 1: Write the failing migration test**

Create `tests/core/legacy-tag-migration.test.cjs` covering:

- existing tag values are inventoried with counts
- obvious case/spacing variants map to one canonical target
- ambiguous tags generate review items instead of auto-merging
- migrated assignments use a legacy source kind such as `legacy_ai`

Run: `node.exe --test tests/core/legacy-tag-migration.test.cjs`
Expected: FAIL because migration helpers do not exist.

- [ ] **Step 2: Implement inventory and normalization helpers**

Create `src/services/tags/legacyTagMigration.ts` with functions like:

- `inventoryLegacyTags`
- `normalizeLegacyLabel`
- `buildMigrationDecisions`
- `migrateLegacyAssignments`

Keep auto-mapping limited to high-confidence transforms:

- case
- whitespace
- punctuation
- explicit aliases

- [ ] **Step 3: Read current keyword/tag sources through payload helpers**

Modify `src/services/handlers/assetPayloadModel.ts` only as needed so migration code can inspect the current keyword and AI tag shapes consistently.

- [ ] **Step 4: Run the migration test**

Run: `node.exe --test tests/core/legacy-tag-migration.test.cjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run:

- `npm.cmd run lint:fast:staged`
- `npm.cmd run complexity:staged`
- `npm.cmd run quality:staged`

Expected: PASS

- [ ] **Step 6: Commit migration support**

```bash
git add src/services/tags/legacyTagMigration.ts src/services/handlers/assetPayloadModel.ts tests/core/legacy-tag-migration.test.cjs
git commit -m "feat: add legacy tag migration support"
```

### Task 5: Generate deterministic date tags from resolved photo dates

**Files:**

- Create: `src/services/tags/dateTagGenerator.ts`
- Modify: `src/services/workflowRuntime/modules/estimatePhotoDateModule.ts`
- Test: `tests/core/date-tag-generator.test.cjs`

- [ ] **Step 1: Write the failing date-tag test**

Create `tests/core/date-tag-generator.test.cjs` covering:

- `1932` produces `20th century`, `1930s`, `early 1930s`, `1932`
- season tags are generated when the date precision supports them
- null/unknown dates do not produce misleading tags

Run: `node.exe --test tests/core/date-tag-generator.test.cjs`
Expected: FAIL because the generator does not exist.

- [ ] **Step 2: Implement the generator**

Create `src/services/tags/dateTagGenerator.ts` with a pure function that emits canonical date tag labels from resolved dates and ranges.

- [ ] **Step 3: Trigger regeneration from the existing date workflow**

Modify `src/services/workflowRuntime/modules/estimatePhotoDateModule.ts` so date recalculation also refreshes system date-tag assignments for the asset.

- [ ] **Step 4: Run the date-tag test**

Run: `node.exe --test tests/core/date-tag-generator.test.cjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 6: Commit date-tag generation**

```bash
git add src/services/tags/dateTagGenerator.ts src/services/workflowRuntime/modules/estimatePhotoDateModule.ts tests/core/date-tag-generator.test.cjs
git commit -m "feat: generate deterministic date tags"
```

## Chunk 3: AI Tagging Against The Approved Vocabulary

### Task 6: Constrain AI tagging to approved tags and proposals

**Files:**

- Modify: `src/services/aiMetadata/geminiPrompts.ts`
- Modify: `src/services/aiMetadata/geminiResponseSchema.ts`
- Modify: `src/services/aiMetadata/liveRuntime.ts`
- Test: `tests/core/ai-tagging-vocabulary.test.cjs`

- [ ] **Step 1: Write the failing AI-tagging test**

Create `tests/core/ai-tagging-vocabulary.test.cjs` covering:

- AI receives approved vocabulary input
- AI outputs approved canonical tags separately from new tag proposals
- AI does not directly create free-form assignments

Run: `node.exe --test tests/core/ai-tagging-vocabulary.test.cjs`
Expected: FAIL because current prompts and runtime do not enforce this split.

- [ ] **Step 2: Update the prompt contract**

Modify `src/services/aiMetadata/geminiPrompts.ts` so AI is instructed to:

- prefer existing approved tags
- avoid broad low-value labels
- emit proposals for genuinely missing concepts

- [ ] **Step 3: Update schema/runtime handling**

Modify:

- `src/services/aiMetadata/geminiResponseSchema.ts`
- `src/services/aiMetadata/liveRuntime.ts`

so AI returns:

- canonical tag labels chosen from the approved set
- proposal candidates for missing concepts

and the runtime converts those into:

- asset tag assignments for approved tags
- review items for proposals

- [ ] **Step 4: Run the AI-tagging test**

Run: `node.exe --test tests/core/ai-tagging-vocabulary.test.cjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run:

- `npm.cmd run lint:fast:staged`
- `npm.cmd run complexity:staged`
- `npm.cmd run quality:staged`

Expected: PASS

- [ ] **Step 6: Commit AI-vocabulary enforcement**

```bash
git add src/services/aiMetadata/geminiPrompts.ts src/services/aiMetadata/geminiResponseSchema.ts src/services/aiMetadata/liveRuntime.ts tests/core/ai-tagging-vocabulary.test.cjs
git commit -m "feat: constrain ai tagging to approved vocabulary"
```

## Chunk 4: Manual Tagging In Single-Photo And Bulk Gallery Flows

### Task 7: Add tag commands to the runtime boundary

**Files:**

- Modify: `src/services/handlers/assetCommands.ts`
- Modify: `src/boundary/runtime/usePhotoLibrary.commands.ts`
- Modify: `src/ui/hooks/usePhotoLibrary.ts`
- Test: `tests/core/tag-command-handlers.test.cjs`

- [ ] **Step 1: Write the failing command test**

Create `tests/core/tag-command-handlers.test.cjs` covering:

- assign canonical tag to asset
- remove tag from asset
- bulk assign canonical tag to assets
- create canonical tag manually
- fetch review items for tags

Run: `node.exe --test tests/core/tag-command-handlers.test.cjs`
Expected: FAIL because these commands do not exist.

- [ ] **Step 2: Add backend command handlers**

Modify `src/services/handlers/assetCommands.ts` to support:

- add tag assignment
- remove tag assignment
- bulk add/remove tag assignments
- fetch available tags and review items where appropriate

- [ ] **Step 3: Add transport helpers**

Modify:

- `src/boundary/runtime/usePhotoLibrary.commands.ts`
- `src/ui/hooks/usePhotoLibrary.ts`

to expose the tag operations cleanly to React code.

- [ ] **Step 4: Run the command test**

Run: `node.exe --test tests/core/tag-command-handlers.test.cjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 6: Commit the tag commands**

```bash
git add src/services/handlers/assetCommands.ts src/boundary/runtime/usePhotoLibrary.commands.ts src/ui/hooks/usePhotoLibrary.ts tests/core/tag-command-handlers.test.cjs
git commit -m "feat: add tag assignment commands"
```

### Task 8: Add manual tagging to the single-photo view

**Files:**

- Modify: `src/ui/components/single-photo/InfoPanel.tsx`
- Modify: `src/ui/components/library/GalleryInfoPanel.tsx`
- Create: `src/ui/components/tags/TagEditor.tsx`
- Test: `tests/ui/single-photo-tagging.test.cjs`

- [ ] **Step 1: Write the failing UI test**

Create `tests/ui/single-photo-tagging.test.cjs` covering:

- current tags render with source badges
- user can add an approved tag
- user can remove a manual tag
- user can create a new canonical tag intentionally

Run: `node.exe --test tests/ui/single-photo-tagging.test.cjs`
Expected: FAIL because the editor UI does not exist.

- [ ] **Step 2: Create the tag editor component**

Create `src/ui/components/tags/TagEditor.tsx` as a focused reusable UI for:

- rendering assignments
- choosing from approved tags
- creating a new manual canonical tag

- [ ] **Step 3: Add the editor to single-photo flows**

Modify:

- `src/ui/components/single-photo/InfoPanel.tsx`
- `src/ui/components/library/GalleryInfoPanel.tsx`

to render manual tag controls in the existing info panel flow.

- [ ] **Step 4: Run the single-photo tagging test**

Run: `node.exe --test tests/ui/single-photo-tagging.test.cjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run:

- `npm.cmd run lint:fast:staged`
- `npm.cmd run complexity:staged`
- `npm.cmd run quality:staged`

Expected: PASS

- [ ] **Step 6: Commit single-photo tagging**

```bash
git add src/ui/components/single-photo/InfoPanel.tsx src/ui/components/library/GalleryInfoPanel.tsx src/ui/components/tags/TagEditor.tsx tests/ui/single-photo-tagging.test.cjs
git commit -m "feat: add manual tagging in single photo view"
```

### Task 9: Add bulk gallery tagging

**Files:**

- Modify: `src/ui/components/app/AppFilterBar.tsx`
- Modify: `src/ui/components/LibraryView.tsx`
- Modify: `src/ui/App.tsx`
- Test: `tests/repo/bulk-gallery-tagging-wiring.test.mjs`

- [ ] **Step 1: Write the failing wiring test**

Create `tests/repo/bulk-gallery-tagging-wiring.test.mjs` covering:

- gallery selection actions expose bulk tag add/remove
- the bulk action is wired from the app shell into the library view
- existing selection state remains the source of truth

Run: `node.exe --test tests/repo/bulk-gallery-tagging-wiring.test.mjs`
Expected: FAIL because bulk tag wiring does not exist.

- [ ] **Step 2: Add bulk tag action wiring**

Modify:

- `src/ui/components/app/AppFilterBar.tsx`
- `src/ui/components/LibraryView.tsx`
- `src/ui/App.tsx`

to expose bulk tag add/remove for the current gallery selection.

- [ ] **Step 3: Run the wiring test**

Run: `node.exe --test tests/repo/bulk-gallery-tagging-wiring.test.mjs`
Expected: PASS

- [ ] **Step 4: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 5: Commit bulk gallery tagging**

```bash
git add src/ui/components/app/AppFilterBar.tsx src/ui/components/LibraryView.tsx src/ui/App.tsx tests/repo/bulk-gallery-tagging-wiring.test.mjs
git commit -m "feat: add bulk gallery tagging"
```

## Chunk 5: Review Inbox And Proposal Workflows

### Task 10: Add a central review inbox for generic review items

**Files:**

- Create: `src/ui/components/review/ReviewInboxView.tsx`
- Modify: `src/ui/components/app/AppMainContent.tsx`
- Modify: `src/ui/hooks/useAppRuntimeUi.ts`
- Test: `tests/repo/review-inbox-wiring.test.mjs`

- [ ] **Step 1: Write the failing inbox wiring test**

Create `tests/repo/review-inbox-wiring.test.mjs` covering:

- app state supports a review inbox route/view
- main content renders the inbox
- review item type filtering is available

Run: `node.exe --test tests/repo/review-inbox-wiring.test.mjs`
Expected: FAIL because the inbox view does not exist.

- [ ] **Step 2: Create the inbox view**

Create `src/ui/components/review/ReviewInboxView.tsx` to render:

- pending review items
- type filters
- approve/reject actions

Keep the UI generic; do not hard-code only tags into the core component structure.

- [ ] **Step 3: Wire the inbox into the app shell**

Modify:

- `src/ui/components/app/AppMainContent.tsx`
- `src/ui/hooks/useAppRuntimeUi.ts`

so the app can navigate to a review inbox screen.

- [ ] **Step 4: Run the inbox wiring test**

Run: `node.exe --test tests/repo/review-inbox-wiring.test.mjs`
Expected: PASS

- [ ] **Step 5: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 6: Commit the review inbox**

```bash
git add src/ui/components/review/ReviewInboxView.tsx src/ui/components/app/AppMainContent.tsx src/ui/hooks/useAppRuntimeUi.ts tests/repo/review-inbox-wiring.test.mjs
git commit -m "feat: add generic review inbox"
```

### Task 11: Add per-photo proposal review in context

**Files:**

- Modify: `src/ui/components/single-photo/InfoPanel.tsx`
- Modify: `src/ui/components/tags/TagEditor.tsx`
- Test: `tests/ui/tag-proposal-review.test.cjs`

- [ ] **Step 1: Write the failing contextual-review test**

Create `tests/ui/tag-proposal-review.test.cjs` covering:

- photo-level tag proposals are visible in context
- proposal approval can map to an existing canonical tag
- proposal approval can create a new canonical tag when chosen deliberately
- proposal rejection updates review state without mutating the vocabulary

Run: `node.exe --test tests/ui/tag-proposal-review.test.cjs`
Expected: FAIL because contextual review does not exist.

- [ ] **Step 2: Add contextual review actions**

Modify:

- `src/ui/components/single-photo/InfoPanel.tsx`
- `src/ui/components/tags/TagEditor.tsx`

to render and action tag proposals in context for the current asset.

- [ ] **Step 3: Run the contextual-review test**

Run: `node.exe --test tests/ui/tag-proposal-review.test.cjs`
Expected: PASS

- [ ] **Step 4: Run fast checks**

Run: `npm.cmd run quality:staged`
Expected: PASS

- [ ] **Step 5: Commit contextual review**

```bash
git add src/ui/components/single-photo/InfoPanel.tsx src/ui/components/tags/TagEditor.tsx tests/ui/tag-proposal-review.test.cjs
git commit -m "feat: review tag proposals in photo context"
```

## Chunk 6: Final Migration, Filtering, And Verification

### Task 12: Switch gallery filtering to canonical tag assignments and finish the migration path

**Files:**

- Modify: `src/services/handlers/assetQueryFilters.ts`
- Modify: `src/services/handlers/assetCommands.ts`
- Modify: `src/ui/components/library/LibraryToolbar.tsx`
- Test: `tests/repo/gallery-tag-filter-wiring.test.mjs`

- [ ] **Step 1: Write or extend the failing filter test**

Update `tests/repo/gallery-tag-filter-wiring.test.mjs` to assert:

- gallery tag filtering uses canonical tag assignments
- aliases resolve case-insensitively to canonical tags
- dropdown options come from the canonical vocabulary rather than raw AI blobs

Run: `node.exe --test tests/repo/gallery-tag-filter-wiring.test.mjs`
Expected: FAIL until the canonical filter path replaces the transitional raw metadata path.

- [ ] **Step 2: Switch backend filtering to canonical assignments**

Modify:

- `src/services/handlers/assetQueryFilters.ts`
- `src/services/handlers/assetCommands.ts`

to query `asset_tag_assignments` and `tag_definitions` instead of directly parsing keyword JSON for the final implementation.

- [ ] **Step 3: Switch the gallery dropdown to the canonical vocabulary**

Modify `src/ui/components/library/LibraryToolbar.tsx` so tag options come from approved canonical tags and not only the currently loaded asset payload.

- [ ] **Step 4: Run the gallery filter test**

Run: `node.exe --test tests/repo/gallery-tag-filter-wiring.test.mjs`
Expected: PASS

- [ ] **Step 5: Run focused regression checks**

Run:

- `npm.cmd run quality:staged`
- `npm.cmd run quality`

Expected: PASS

- [ ] **Step 6: Commit the final canonical filter path**

```bash
git add src/services/handlers/assetQueryFilters.ts src/services/handlers/assetCommands.ts src/ui/components/library/LibraryToolbar.tsx tests/repo/gallery-tag-filter-wiring.test.mjs
git commit -m "feat: filter gallery by canonical tags"
```

- [ ] **Step 7: Inspect final git state**

Run:

- `git.exe diff --cached --stat`
- `git.exe status --short`

Expected: no unexplained task files remain staged or partially staged.
