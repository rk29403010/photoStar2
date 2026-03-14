# Library Gallery Hover Status And Sort Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a library sort control for filename and photo date, move photo hover detail into the app status bar, and remove tile-level sensitivity controls plus the top-right technical hover overlay.

**Architecture:** Keep sort and hover state in the library UI layer. `LibraryView` owns sort mode and hovered asset, `LayoutEngine` forwards hover events, `Tile` becomes visually simpler, and `AppStatusBar` renders the current-photo detail through an explicit typed prop.

**Tech Stack:** React, TypeScript, existing inline-style UI components, npm quality scripts

---

## File Map

- Modify: `src/ui/components/LibraryView.tsx`
  - Own sort state, hovered asset state, sorted display asset derivation, and toolbar rendering.
- Modify: `src/ui/components/layout/LayoutEngine.tsx`
  - Forward hover asset callbacks from tile instances.
- Modify: `src/ui/components/layout/Tile.tsx`
  - Remove sensitivity controls and technical flash overlay, keep hover reporting, and preserve caption/sensitivity badge behavior.
- Modify: `src/ui/components/app/AppStatusBar.tsx`
  - Add typed current-photo display with subtle transition.
- Modify: app shell files that pass library hover state into the status bar.
- Add or modify tests under `tests/`
  - Cover sort helpers and status-bar rendering.

## Chunk 1: Sort Helpers And Library Toolbar

### Task 1: Add failing tests for gallery sorting helpers

**Files:**

- Test: `tests/ui/library-gallery-sort.test.ts`
- Modify: `src/ui/components/LibraryView.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it('sorts assets by filename using natural order', () => {
  expect(sortAssetsByMode([
    { id: '2', original_path: 'c:/photos/img10.jpg' },
    { id: '1', original_path: 'c:/photos/img2.jpg' },
  ], 'filename').map((asset) => asset.id)).toEqual(['1', '2']);
});

it('sorts assets by created_at descending for date mode', () => {
  expect(sortAssetsByMode([
    { id: '1', original_path: 'a.jpg', created_at: '2024-01-01T00:00:00Z' },
    { id: '2', original_path: 'b.jpg', created_at: '2025-01-01T00:00:00Z' },
  ], 'date').map((asset) => asset.id)).toEqual(['2', '1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/library-gallery-sort.test.ts`
Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
type LibrarySortMode = 'filename' | 'date';

function sortAssetsByMode(assets: Asset[], mode: LibrarySortMode): Asset[] {
  const copy = [...assets];
  if (mode === 'filename') {
    return copy.sort((left, right) => getFilename(left).localeCompare(getFilename(right), undefined, { numeric: true, sensitivity: 'base' }));
  }

  return copy.sort((left, right) => getDateRank(right.created_at) - getDateRank(left.created_at));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/library-gallery-sort.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ui/library-gallery-sort.test.ts src/ui/components/LibraryView.tsx
git commit -m "test: cover library gallery sort helpers"
```

### Task 2: Add the library toolbar and sort state

**Files:**

- Modify: `src/ui/components/LibraryView.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it('renders a sort control with filename and date options', () => {
  render(<LibraryView ... />);
  expect(screen.getByLabelText(/sort/i)).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Filename' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Date' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/library-view.test.tsx`
Expected: FAIL because the toolbar is not rendered yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
const [sortMode, setSortMode] = useState<LibrarySortMode>('date');

<label>
  <span>Sort</span>
  <select value={sortMode} onChange={(event) => setSortMode(event.target.value as LibrarySortMode)}>
    <option value="filename">Filename</option>
    <option value="date">Date</option>
  </select>
</label>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/library-view.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/LibraryView.tsx tests/ui/library-view.test.tsx
git commit -m "feat: add library gallery sort control"
```

## Chunk 2: Hover Propagation And Status Bar

### Task 3: Add failing status-bar tests for current photo display

**Files:**

- Test: `tests/ui/app-status-bar.test.tsx`
- Modify: `src/ui/components/app/AppStatusBar.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it('renders current photo details when a hovered asset is provided', () => {
  render(<AppStatusBar ... currentPhoto={{ filename: 'IMG_0001.JPG', sensitivity: 'Review', dimensions: '3024 × 4032' }} />);
  expect(screen.getByText(/current photo/i)).toBeInTheDocument();
  expect(screen.getByText(/IMG_0001.JPG/)).toBeInTheDocument();
  expect(screen.getByText(/Review/)).toBeInTheDocument();
  expect(screen.getByText(/3024 × 4032/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/app-status-bar.test.tsx`
Expected: FAIL because `currentPhoto` is not supported yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
interface CurrentPhotoStatus {
  filename: string;
  sensitivity: string;
  dimensions?: string | null;
}
```

Add a compact status-bar segment that conditionally renders from the new prop.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/app-status-bar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/app/AppStatusBar.tsx tests/ui/app-status-bar.test.tsx
git commit -m "feat: add current photo status bar detail"
```

### Task 4: Wire hovered asset state from library tiles to the status bar

**Files:**

- Modify: `src/ui/components/layout/Tile.tsx`
- Modify: `src/ui/components/layout/LayoutEngine.tsx`
- Modify: `src/ui/components/LibraryView.tsx`
- Modify: app shell wiring files that connect `LibraryView` and `AppStatusBar`

- [ ] **Step 1: Write the failing test**

Write a component test that hovers a library tile and expects the app status bar to show the hovered filename.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/library-hover-status.test.tsx`
Expected: FAIL because hover events are not wired through.

- [ ] **Step 3: Write minimal implementation**

```tsx
onMouseEnter={() => onHoverAssetChange?.(asset)}
onMouseLeave={() => onHoverAssetChange?.(null)}
```

Thread the callback through `LayoutEngine`, store hovered asset in `LibraryView`, and map it into `AppStatusBar`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/library-hover-status.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/layout/Tile.tsx src/ui/components/layout/LayoutEngine.tsx src/ui/components/LibraryView.tsx
git add src/ui/components/app/AppStatusBar.tsx src/ui/components/app/AppMainContent.tsx
git add tests/ui/library-hover-status.test.tsx
git commit -m "feat: surface hovered library photo in status bar"
```

## Chunk 3: Remove Tile Controls And Verify Quality

### Task 5: Remove tile sensitivity controls and top-right technical overlay

**Files:**

- Modify: `src/ui/components/layout/Tile.tsx`

- [ ] **Step 1: Write the failing test**

Write or update a tile render test asserting the sensitivity action buttons and top-right technical overlay do not appear on hover.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/tile.test.tsx`
Expected: FAIL because the hover-only controls and overlay still render.

- [ ] **Step 3: Write minimal implementation**

Remove `SensitivityControls`, related action constants, and `TechnicalOverlay`, while keeping filename helper logic for hover status-bar mapping.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/tile.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/layout/Tile.tsx tests/ui/tile.test.tsx
git commit -m "refactor: simplify library tile hover overlays"
```

### Task 6: Run staged quality gates and full verification

**Files:**

- Modify: any touched files as needed from fixes

- [ ] **Step 1: Run focused tests**

Run:

- `npm test -- tests/ui/library-gallery-sort.test.ts`
- `npm test -- tests/ui/app-status-bar.test.tsx`
- `npm test -- tests/ui/library-hover-status.test.tsx`
- `npm test -- tests/ui/tile.test.tsx`

Expected: PASS

- [ ] **Step 2: Run staged quality**

Run: `npm run quality:staged`
Expected: PASS

- [ ] **Step 3: Run full quality**

Run: `npm run quality`
Expected: PASS

- [ ] **Step 4: Commit final fixes**

```bash
git add src/ui/components/LibraryView.tsx src/ui/components/layout/LayoutEngine.tsx
git add src/ui/components/layout/Tile.tsx src/ui/components/app/AppStatusBar.tsx
git add src/ui/components/app/AppMainContent.tsx tests/ui/
git commit -m "feat: refine library gallery hover status and sorting"
```
