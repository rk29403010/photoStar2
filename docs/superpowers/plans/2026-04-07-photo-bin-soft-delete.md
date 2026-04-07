# Photo Bin Soft Delete Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reversible photo bin workflow that hides binned photos from the normal library and albums, supports restore from the Bin album, and exposes immediate undo in the status bar.

**Architecture:** Treat the Bin as a protected system album backed by an asset-level `binned_at` flag so visibility rules stay centralized in backend queries. Keep the UI changes split across focused helpers so the backend owns hiding/restoring semantics, while the frontend only switches actions and renders the undo/status banner.

**Tech Stack:** React 19, TypeScript, better-sqlite3, repo `node:test` wiring tests, repo quality scripts.

---

## Chunk 1: Backend bin state and query rules

### Task 1: Lock schema and command wiring with failing tests

**Files:**

- Create: `tests/repo/photo-bin-wiring.test.mjs`
- Verify: `src/data/dbSchema.ts`
- Verify: `src/services/handlers/collectionCommands.ts`
- Verify: `src/services/handlers/assetQueryFilters.ts`
- Verify: `src/boundary/runtime/usePhotoLibrary.actions.ts`

- [ ] **Step 1: Write the failing test**

Add source-level assertions for:

- `assets.binned_at`
- protected/system bin album helpers
- `move_to_bin` and `restore_from_bin` command wiring
- normal album/library queries excluding binned assets
- frontend action creators exposing bin commands

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/repo/photo-bin-wiring.test.mjs`
Expected: FAIL because the schema, commands, and action wiring do not exist yet.

### Task 2: Add backend bin helpers and schema support

**Files:**

- Modify: `src/data/dbSchema.ts`
- Modify: `src/boundary/contracts/core.ts`
- Create: `src/services/handlers/binAlbum.ts`

- [ ] **Step 1: Add the minimal schema fields**

Add:

- `binned_at TEXT` to `assets`
- optional album metadata needed to identify a protected/system bin album without overloading normal user albums

- [ ] **Step 2: Add the shared bin helper module**

Implement a focused helper module for:

- stable bin album id/title constants
- ensuring the bin album exists
- checking whether an album id is the system bin

- [ ] **Step 3: Add contract fields**

Extend `Album` and `Asset` with only the fields the UI needs, such as:

- `Asset.binned_at?: string | null`
- `Album.is_system?: boolean`
- `Album.system_kind?: 'bin' | null`

- [ ] **Step 4: Run the wiring test again**

Run: `node --test tests/repo/photo-bin-wiring.test.mjs`
Expected: still FAIL because command/query behavior is not implemented yet.

### Task 3: Implement move-to-bin and restore commands

**Files:**

- Modify: `src/services/handlers/collectionCommands.ts`
- Modify: `src/services/handlers/types.ts` if command typing requires updates
- Reuse: `src/services/handlers/binAlbum.ts`

- [ ] **Step 1: Write the failing command expectations**

Expand `tests/repo/photo-bin-wiring.test.mjs` to assert:

- `move_to_bin` handler exists
- `restore_from_bin` handler exists
- delete-album protection rejects the system bin

- [ ] **Step 2: Run the test to verify it fails for the right reason**

Run: `node --test tests/repo/photo-bin-wiring.test.mjs`
Expected: FAIL on missing command and protection patterns.

- [ ] **Step 3: Write the minimal command implementation**

Implement transactional handlers that:

- ensure the bin album exists
- set or clear `assets.binned_at`
- add or remove `album_items` rows for the bin album
- reject deletion of the system bin album

- [ ] **Step 4: Run the test to verify command wiring passes**

Run: `node --test tests/repo/photo-bin-wiring.test.mjs`
Expected: command assertions pass, with remaining failures only in query/UI areas.

### Task 4: Centralize the “hide binned unless viewing Bin” query rule

**Files:**

- Modify: `src/services/handlers/assetQueryFilters.ts`
- Modify: `src/services/handlers/assetCommands.ts`
- Modify: `src/services/handlers/collectionCommands.ts`
- Reuse: `src/services/handlers/binAlbum.ts`

- [ ] **Step 1: Write the failing query expectations**

Add failing assertions that:

- normal asset queries append a binned exclusion clause
- album filters treat the system bin differently
- album counts and album item queries exclude binned assets unless the album is the bin

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/repo/photo-bin-wiring.test.mjs`
Expected: FAIL on missing exclusion logic.

- [ ] **Step 3: Implement the minimal query helpers**

Add focused helpers instead of inline branches in large files:

- build normal “exclude binned” clause
- build album-aware inclusion/exclusion clause for bin vs non-bin albums
- update album count/cover queries to ignore hidden items outside the bin

- [ ] **Step 4: Run the backend wiring test**

Run: `node --test tests/repo/photo-bin-wiring.test.mjs`
Expected: backend-oriented assertions pass.

## Chunk 2: Frontend actions and album surface

### Task 5: Add runtime actions for bin operations

**Files:**

- Modify: `src/boundary/runtime/usePhotoLibrary.actions.ts`
- Modify: `src/ui/hooks/usePhotoLibrary.ts` only if the returned action shape changes need explicit propagation

- [ ] **Step 1: Write the failing action wiring assertions**

Extend `tests/repo/photo-bin-wiring.test.mjs` to assert:

- `moveToBin`
- `restoreFromBin`
- any album metadata used by the UI

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/repo/photo-bin-wiring.test.mjs`
Expected: FAIL on missing action creators.

- [ ] **Step 3: Implement the minimal action creators**

Add request-backed action creators that call:

- `move_to_bin`
- `restore_from_bin`

Keep them in the album action block if that remains the smallest stable home.

- [ ] **Step 4: Re-run the test**

Run: `node --test tests/repo/photo-bin-wiring.test.mjs`
Expected: action wiring assertions pass.

### Task 6: Surface the protected Bin album in Albums view

**Files:**

- Modify: `src/ui/components/AlbumsView.tsx`
- Create: `src/ui/components/albums/albumsViewModel.ts`
- Create: `tests/repo/photo-bin-albums-wiring.test.mjs`

- [ ] **Step 1: Write the failing albums view test**

Assert that the albums UI:

- recognizes system/bin album metadata
- renders the Bin card
- suppresses the delete affordance for the Bin
- keeps the Bin visible even when empty

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/repo/photo-bin-albums-wiring.test.mjs`
Expected: FAIL because the albums view has no system-album handling.

- [ ] **Step 3: Extract a small albums view model**

Move sorting/protection decisions into `albumsViewModel.ts` so `AlbumsView.tsx` stays under the repo’s size guardrails.

- [ ] **Step 4: Implement the minimal UI changes**

Update `AlbumsView.tsx` to:

- render the Bin card first
- label it clearly as system-managed
- skip delete handling for protected albums

- [ ] **Step 5: Re-run the albums test**

Run: `node --test tests/repo/photo-bin-albums-wiring.test.mjs`
Expected: PASS.

## Chunk 3: Library actions, restore mode, and status-bar undo

### Task 7: Add status-bar action support with a focused model

**Files:**

- Create: `src/ui/components/app/statusBannerModel.ts`
- Create: `tests/repo/photo-bin-status-bar-wiring.test.mjs`
- Modify: `src/ui/hooks/useAppRuntimeUi.ts`
- Modify: `src/ui/components/app/AppStatusBar.tsx`
- Modify: `src/ui/components/app/LoadedAppShell.tsx`

- [ ] **Step 1: Write the failing status-bar test**

Assert that:

- UI state stores a banner model, not only a plain string
- `AppStatusBar` supports an inline action button
- the shell passes the richer banner through

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/repo/photo-bin-status-bar-wiring.test.mjs`
Expected: FAIL on missing banner model and action rendering.

- [ ] **Step 3: Implement the minimal banner model**

Create a small shared type/helper for:

- `message`
- `actionLabel`
- `onAction`
- `tone`
- optional `expiresAt` or timer-based dismissal support in the UI hook

- [ ] **Step 4: Update the status bar and UI state**

Keep compatibility by letting existing plain messages map into the new banner model while supporting click-to-undo.

- [ ] **Step 5: Re-run the status-bar test**

Run: `node --test tests/repo/photo-bin-status-bar-wiring.test.mjs`
Expected: PASS.

### Task 8: Add library bulk actions and single-photo actions for Bin/Restore

**Files:**

- Create: `src/ui/components/app/libraryBinActionModel.ts`
- Create: `tests/repo/photo-bin-library-actions-wiring.test.mjs`
- Modify: `src/ui/components/app/AppFilterBar.tsx`
- Modify: `src/ui/components/single-photo/singlePhotoActionMenuModel.ts`
- Modify: `src/ui/components/single-photo/ActionOverlayControls.tsx`
- Modify: `src/ui/components/LibraryView.tsx` only if new props are needed
- Modify: `src/ui/components/app/AppMainContent.tsx` and `src/ui/components/app/LoadedAppShell.tsx` only as needed to thread the new handlers through

- [ ] **Step 1: Write the failing library action test**

Assert that:

- selection actions include `Move to Bin` outside the bin
- selection actions switch to `Restore` inside the bin
- the single-photo action menu exposes the same mode-sensitive action

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/repo/photo-bin-library-actions-wiring.test.mjs`
Expected: FAIL on missing bin/restore actions.

- [ ] **Step 3: Extract a tiny mode helper**

Add `libraryBinActionModel.ts` so the “am I in Bin?” and label switching logic stays out of already-large shell components.

- [ ] **Step 4: Implement the minimal UI wiring**

Thread explicit callbacks such as:

- `onMoveSelectionToBin`
- `onRestoreSelectionFromBin`
- `onMoveAssetToBin`
- `onRestoreAssetFromBin`

Only pass them where they are actually rendered.

- [ ] **Step 5: Re-run the library action test**

Run: `node --test tests/repo/photo-bin-library-actions-wiring.test.mjs`
Expected: PASS.

### Task 9: Integrate undo/restore orchestration in the app shell

**Files:**

- Create: `src/ui/hooks/usePhotoBinActions.ts`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/hooks/useAppRuntimeUi.ts`
- Modify: `src/ui/components/app/AppFilterBar.tsx`
- Modify: `src/ui/components/app/LoadedAppShell.tsx`

- [ ] **Step 1: Write the failing orchestration test**

Extend `tests/repo/photo-bin-library-actions-wiring.test.mjs` or add a dedicated test asserting:

- delete-to-bin updates the banner with an undo action
- undo calls restore for the same asset batch
- bin-triggered removals do not fall back to the generic “no longer available” recovery message

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/repo/photo-bin-library-actions-wiring.test.mjs tests/repo/photo-bin-status-bar-wiring.test.mjs`
Expected: FAIL on missing orchestration hook and undo-specific recovery behavior.

- [ ] **Step 3: Implement a dedicated hook for bin actions**

Add `usePhotoBinActions.ts` to keep `App.tsx` from growing further. The hook should:

- collect selected asset ids
- call move/restore actions
- clear selection when needed
- set the undo banner
- suppress the generic missing-selection message for assets intentionally moved to bin
- refresh library/albums as needed

- [ ] **Step 4: Re-run the orchestration tests**

Run: `node --test tests/repo/photo-bin-library-actions-wiring.test.mjs tests/repo/photo-bin-status-bar-wiring.test.mjs`
Expected: PASS.

## Chunk 4: Verification and finish

### Task 10: Run targeted quality checks while iterating

**Files:**

- Verify: `src/data/dbSchema.ts`
- Verify: `src/services/handlers/binAlbum.ts`
- Verify: `src/services/handlers/collectionCommands.ts`
- Verify: `src/services/handlers/assetCommands.ts`
- Verify: `src/services/handlers/assetQueryFilters.ts`
- Verify: `src/boundary/runtime/usePhotoLibrary.actions.ts`
- Verify: `src/ui/components/AlbumsView.tsx`
- Verify: `src/ui/components/app/AppFilterBar.tsx`
- Verify: `src/ui/components/app/AppStatusBar.tsx`
- Verify: `src/ui/App.tsx`
- Verify: new helper files and new tests

- [ ] **Step 1: Run the staged quality guardrail**

Run: `npm.cmd run quality:staged`
Expected: PASS for the touched files.

- [ ] **Step 2: Run complexity explicitly on touched TypeScript files**

Run: `npm.cmd run complexity:staged -- --files=src/data/dbSchema.ts,src/services/handlers/binAlbum.ts,src/services/handlers/collectionCommands.ts,src/services/handlers/assetCommands.ts,src/services/handlers/assetQueryFilters.ts,src/boundary/runtime/usePhotoLibrary.actions.ts,src/ui/components/AlbumsView.tsx,src/ui/components/app/AppFilterBar.tsx,src/ui/components/app/AppStatusBar.tsx,src/ui/App.tsx,src/ui/hooks/useAppRuntimeUi.ts,src/ui/hooks/usePhotoBinActions.ts`
Expected: PASS, or update the file list to only include changed files if the final write set is smaller.

### Task 11: Run full handoff verification

**Files:**

- Verify: all touched files

- [ ] **Step 1: Run repo wiring tests**

Run: `node --test tests/repo/photo-bin-wiring.test.mjs tests/repo/photo-bin-albums-wiring.test.mjs tests/repo/photo-bin-status-bar-wiring.test.mjs tests/repo/photo-bin-library-actions-wiring.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run full quality**

Run: `npm.cmd run quality`
Expected: PASS.

- [ ] **Step 3: Inspect Git state before handoff**

Run: `git.exe status --short`
Expected: only the files from this feature are modified/staged.
