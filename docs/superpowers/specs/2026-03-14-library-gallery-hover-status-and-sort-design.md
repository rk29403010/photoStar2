# Library Gallery Hover Status And Sort Design

**Date:** 2026-03-14

## Goal

Refine the library gallery view so hover details move into the app status bar, remove tile-level sensitivity controls and the top-right technical flash overlay, and add gallery sort controls for filename and photo date.

## Current Context

- The library gallery is rendered by `LibraryView` and `LayoutEngine`, with per-tile overlays in `Tile`.
- `AppStatusBar` already owns the persistent status summary and is the right place for lightweight transient hover detail.
- Asset records already expose `original_path`, `width`, `height`, `sensitivity_score`, `sensitivity_status`, and `created_at`.
- Existing backend gallery ordering only supports `default` and `previewed_first`; there is no library sort control seam in the current UI.

## Requirements

### Hover behavior

- Remove the manual sensitivity controls from library tiles.
- Remove the top-right technical hover flash overlay from library tiles.
- When the pointer moves over a photo, show a `Current photo` segment in the status bar with:
  - filename
  - sensitivity
  - dimensions
- The status-bar segment should animate subtly as the hovered photo changes.
- Hover detail should clear when the pointer leaves the tile.

### Sort behavior

- Add sort options to the library view for:
  - filename
  - date
- `Date` means the photo capture date, using the repo's existing `created_at` value, which already carries capture or estimated timing for display and ordering purposes.
- The initial implementation should prioritize the fastest safe path and avoid unnecessary backend contract expansion.

## Chosen Approach

Implement sorting locally in the library view and keep hover state in the UI layer.

### Why this approach

- It avoids expanding backend command contracts for a focused UI improvement.
- It keeps hover and sort behavior in the same library-view seam.
- It limits risk to the display layer and preserves current paging/fetch flows.

### Trade-off

- Sorting only applies to currently loaded assets in memory, not the full unloaded dataset. This is acceptable for the requested pass.

## Architecture

### Library sort state

- Add a compact sort control near the top of the library view.
- Keep the selected sort mode in `LibraryView`.
- Derive display assets in this order:
  1. base assets
  2. declustered trailing behavior
  3. selected sort mode

### Hover state propagation

- `Tile` reports hover enter/change/leave as an `Asset | null`.
- `LayoutEngine` forwards the hover callback without taking ownership of the state.
- `LibraryView` stores the currently hovered asset.
- The app shell passes the hovered asset into `AppStatusBar` via an explicit prop for current-photo detail.

### Status bar display

- Extend `AppStatusBar` with a typed current-photo segment instead of relying on generic `rightSlot` usage.
- The segment should display:
  - `Current photo`
  - filename
  - resolved sensitivity label
  - dimensions if available
- Animation should be a short fade/slide transition when the hovered asset changes.

## UI Notes

- Keep the existing tile sensitivity badge unless later feedback asks to remove it too.
- The new sort control should be small and visually subordinate to the gallery content.
- The hover animation should be subtle and stable, not pointer-following.

## Data And Formatting Rules

### Filename

- Extract from `original_path` using the existing filename helper pattern already present in `Tile`.

### Sensitivity

- Prefer manual sensitivity status when present.
- Otherwise derive the displayed label from `sensitivity_score`.
- Use a neutral fallback such as `Unrated` when no sensitivity data exists.

### Dimensions

- Display as `WIDTH × HEIGHT` when both values exist.
- Omit the dimensions field when either value is missing.

### Date sort

- Sort by `created_at` descending for the `Date` option.
- Treat missing or invalid dates as lowest priority so valid-dated assets remain first.

## Testing Strategy

### Unit tests

- Add tests for pure sort helpers:
  - natural filename ordering
  - date ordering by `created_at`
  - handling missing date values

### Component tests

- Add tests for `AppStatusBar` current-photo rendering:
  - no hovered asset
  - hovered asset with filename, sensitivity, and dimensions

### Verification

- Run targeted tests first.
- Run `npm run quality:staged` during iteration.
- Run `npm run quality` before handoff if the change remains larger than a very local edit.

## Files Likely To Change

- `src/ui/components/LibraryView.tsx`
- `src/ui/components/layout/LayoutEngine.tsx`
- `src/ui/components/layout/Tile.tsx`
- `src/ui/components/app/AppStatusBar.tsx`
- app-shell wiring files that connect the library view state to the status bar
- relevant test files under `tests/`

## Risks

- Hover callbacks can create extra renders if the tile reports too aggressively; keep updates limited to meaningful enter/change/leave transitions.
- Local sorting can conflict with future server-side paging expectations; keep the sort state isolated so backend sorting can replace it later if needed.

## Out Of Scope

- Backend sort contract expansion
- Changing gallery pagination semantics
- Reworking non-library views
