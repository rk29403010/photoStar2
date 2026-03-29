# Library Gallery Selection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add grouped-gallery display toggling plus mixed photo/group multi-selection in the Library Gallery without breaking single-click navigation.

**Architecture:** Introduce a small projection layer that turns raw assets into visible gallery entities and a small selection-model layer that tracks photo ids, group ids, and an anchor key. Keep `LibraryView` responsible for display preferences, keep `LayoutEngine` focused on pointer/keyboard selection over visible entities, and keep `Tile` focused on rendering the blue-frame/blue-star selected state.

**Tech Stack:** React, TypeScript, existing gallery components, Node-based `.cjs` tests, repo quality scripts.

---

## Chunk 1: Selection Model And Gallery Projection

### Task 1: Add failing tests for grouped gallery projection

**Files:**

- Create: `tests/core/library-gallery-selection.test.cjs`
- Modify: `src/shared/utils/libraryGallery.ts`
- Create: `src/shared/utils/libraryGallerySelection.ts`

- [ ] **Step 1: Write the failing test**

```js
test('projects canonical group tiles in grouped mode and all photos in expanded mode', () => {
  const assets = [
    { id: 'a1', original_path: 'a1.jpg', created_at: '2026-03-01', group_id: 'g1', group_role: 'canonical', stack_count: 3 },
    { id: 'a2', original_path: 'a2.jpg', created_at: '2026-03-01', group_id: 'g1', group_role: 'member', stack_count: 3 },
    { id: 'a3', original_path: 'a3.jpg', created_at: '2026-03-02' },
  ];

  expect(buildVisibleGalleryItems(assets, { groupSimilarPhotos: true }).map((item) => item.selectionKey)).toEqual([
    'photo:a3',
    'group:g1',
  ]);

  expect(buildVisibleGalleryItems(assets, { groupSimilarPhotos: false }).map((item) => item.selectionKey)).toEqual([
    'photo:a3',
    'photo:a2',
    'photo:a1',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: FAIL because `buildVisibleGalleryItems` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export type LibrarySelectionKey = `photo:${string}` | `group:${string}`;

export function buildVisibleGalleryItems(assets: Asset[], options: { groupSimilarPhotos: boolean; sortMode: LibrarySortMode; declusteredAssetIds?: Set<string> }) {
  // Sort first, then collapse canonical group representatives only when grouped mode is on.
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/core/library-gallery-selection.test.cjs src/shared/utils/libraryGallery.ts src/shared/utils/libraryGallerySelection.ts
git commit -m "feat: add grouped gallery projection model"
```

### Task 2: Add failing tests for mixed photo/group selection state helpers

**Files:**

- Modify: `tests/core/library-gallery-selection.test.cjs`
- Create: `src/shared/utils/librarySelectionState.ts`

- [ ] **Step 1: Write the failing test**

```js
test('toggles and ranges over photo and group selection keys independently', () => {
  const state = createEmptyLibrarySelectionState();
  const items = [
    { selectionKey: 'photo:a1', entityType: 'photo', photoId: 'a1' },
    { selectionKey: 'group:g1', entityType: 'group', groupId: 'g1' },
    { selectionKey: 'photo:a3', entityType: 'photo', photoId: 'a3' },
  ];

  const first = toggleLibrarySelection(items, state, { index: 1, mode: 'replace' });
  expect([...first.groupIds]).toEqual(['g1']);

  const ranged = toggleLibrarySelection(items, first, { index: 2, mode: 'range' });
  expect([...ranged.groupIds]).toEqual(['g1']);
  expect([...ranged.photoIds]).toEqual(['a3']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: FAIL because the selection-state helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export type LibrarySelectionState = {
  photoIds: Set<string>;
  groupIds: Set<string>;
  anchorKey: string | null;
};

export function createEmptyLibrarySelectionState(): LibrarySelectionState {
  return { photoIds: new Set(), groupIds: new Set(), anchorKey: null };
}

export function toggleLibrarySelection(items, state, action) {
  // Apply replace, toggle, and range operations using visible-item keys.
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/core/library-gallery-selection.test.cjs src/shared/utils/librarySelectionState.ts
git commit -m "feat: add mixed library selection state helpers"
```

## Chunk 2: App And Library View Wiring

### Task 3: Add failing tests for grouped-toggle and selection-count model wiring

**Files:**

- Modify: `tests/core/library-gallery-selection.test.cjs`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/components/app/AppStatusBar.tsx`
- Modify: `src/ui/components/LibraryView.tsx`

- [ ] **Step 1: Write the failing test**

```js
test('counts photo and group selections together for the library status summary', () => {
  expect(getLibrarySelectionCount({
    photoIds: new Set(['a1', 'a2']),
    groupIds: new Set(['g1']),
    anchorKey: null,
  })).toBe(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: FAIL because the count helper or wiring does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
const [librarySelection, setLibrarySelection] = useState<LibrarySelectionState>(createEmptyLibrarySelectionState());
const [groupSimilarPhotos, setGroupSimilarPhotos] = useState(true);
```

```tsx
<button aria-pressed={groupSimilarPhotos}>Grouped</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/core/library-gallery-selection.test.cjs src/ui/App.tsx src/ui/components/app/AppStatusBar.tsx src/ui/components/LibraryView.tsx
git commit -m "feat: wire grouped gallery toggle and mixed selection state"
```

### Task 4: Implement grouped gallery projection in `LibraryView`

**Files:**

- Modify: `src/ui/components/LibraryView.tsx`
- Modify: `src/ui/components/app/AppMainContent.tsx`
- Modify: `src/shared/utils/libraryGallerySelection.ts`

- [ ] **Step 1: Write the failing test**

```js
test('keeps group selections stored when switching from grouped view to expanded view', () => {
  // Assert the projection exposes only photo items in expanded mode while preserving groupIds in state helpers.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: FAIL because grouped/expanded preservation behavior is missing.

- [ ] **Step 3: Write minimal implementation**

```ts
const visibleItems = buildVisibleGalleryItems(assets, {
  groupSimilarPhotos,
  sortMode,
  declusteredAssetIds: declusteredAssets,
});
```

```tsx
<LayoutEngine items={visibleItems} ... />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/core/library-gallery-selection.test.cjs src/ui/components/LibraryView.tsx src/ui/components/app/AppMainContent.tsx src/shared/utils/libraryGallerySelection.ts
git commit -m "feat: project grouped gallery items in library view"
```

## Chunk 3: Layout Interactions And Tile Rendering

### Task 5: Add failing tests for range and modifier selection interactions

**Files:**

- Modify: `tests/core/library-gallery-selection.test.cjs`
- Create: `src/ui/components/layout/librarySelectionInteractions.ts`
- Modify: `src/ui/components/layout/LayoutEngine.tsx`

- [ ] **Step 1: Write the failing test**

```js
test('range selection follows visible item order across rows', () => {
  const items = ['photo:a1', 'photo:a2', 'group:g1', 'photo:a4'];
  expect(getSelectionRangeKeys(items, 'photo:a1', 'group:g1')).toEqual([
    'photo:a1',
    'photo:a2',
    'group:g1',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: FAIL because the range helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function getSelectionRangeKeys(keys: string[], anchorKey: string, targetKey: string): string[] {
  // Return the contiguous visible range between anchor and target.
}
```

```ts
// LayoutEngine should use long-press entry, drag extension, ctrl/cmd toggle, and shift-range helpers.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/core/library-gallery-selection.test.cjs src/ui/components/layout/librarySelectionInteractions.ts src/ui/components/layout/LayoutEngine.tsx
git commit -m "feat: add gallery range and modifier selection interactions"
```

### Task 6: Render the blue-star, blue-frame selected state

**Files:**

- Modify: `src/ui/components/layout/Tile.tsx`
- Modify: `src/ui/components/layout/LayoutEngine.tsx`

- [ ] **Step 1: Write the failing test**

```js
test('selected tiles use a blue star and blue frame styling token', () => {
  expect(getSelectedTileFrameColor()).toBe('#60a5fa');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: FAIL because the selected-style helper/token does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
function getSelectedTileFrameColor() {
  return '#60a5fa';
}
```

```tsx
{selected && <SelectedStarBadge />}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/core/library-gallery-selection.test.cjs src/ui/components/layout/Tile.tsx src/ui/components/layout/LayoutEngine.tsx
git commit -m "feat: add selected tile star and frame styling"
```

## Chunk 4: Verification And Quality Gates

### Task 7: Run scoped verification while iterating

**Files:**

- Test: `tests/core/library-gallery-selection.test.cjs`
- Test: `tests/core/library-gallery.test.cjs`

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- tests/core/library-gallery-selection.test.cjs tests/core/library-gallery.test.cjs`
Expected: PASS

- [ ] **Step 2: Run staged quality checks**

Run: `npm run quality:staged`
Expected: PASS

- [ ] **Step 3: Run staged complexity checks**

Run: `npm run complexity:staged`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: verify library gallery selection changes"
```

### Task 8: Run handoff verification

**Files:**

- Verify current branch state only

- [ ] **Step 1: Run full repo quality gate**

Run: `npm run quality`
Expected: PASS

- [ ] **Step 2: Check dev runtime impact if needed**

Run: `npm run dev:impact`
Expected: Confirm whether no restart is needed or whether UI reload is sufficient.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: finalize library gallery selection feature"
```
