# Library Gallery Selection And Grouping Design

## Goal

Add a Library Gallery interaction model that supports:

- A `Group similar photos` display toggle in the gallery filter chip area.
- Long-press to enter select mode without breaking normal click-through to single-photo view.
- Drag, `Ctrl`/`Cmd` click, and `Shift` click selection behaviors across the visible grid order.
- A blue-star, blue-frame selected state.
- Independent background selection of both photo entities and group entities.

## Current Context

The gallery already has:

- App-level `librarySelection: Set<string>` state in [`src/ui/App.tsx`](C:/Users/robin/Projects/photoStar2/src/ui/App.tsx).
- A sortable gallery shell in [`src/ui/components/LibraryView.tsx`](C:/Users/robin/Projects/photoStar2/src/ui/components/LibraryView.tsx).
- Pointer-based selection primitives in [`src/ui/components/layout/LayoutEngine.tsx`](C:/Users/robin/Projects/photoStar2/src/ui/components/layout/LayoutEngine.tsx).
- Tile rendering in [`src/ui/components/layout/Tile.tsx`](C:/Users/robin/Projects/photoStar2/src/ui/components/layout/Tile.tsx).
- Group-aware asset payloads from the backend through `group_id`, `group_role`, and `stack_count`.

The current selection model is photo-id-only and cannot represent group selection independently from photo selection.

## Approved UX Decisions

- The `Group similar photos` control should live with gallery filter chips, not only in a selection bar.
- The selected state should use a blue star plus a blue frame.
- When grouped view is enabled, selecting a grouped tile selects the group entity, not all member photos.

## Interaction Model

### Display Modes

When `Group similar photos` is enabled:

- Canonical/starred representative tiles are shown for groups.
- Ungrouped photos remain visible as individual photo tiles.
- Grouped tiles act as group entities for selection.

When `Group similar photos` is disabled:

- All visible photos are rendered as individual photo tiles.
- Selection operates on photo entities only.

### Selection Entry

- Plain click on a tile while not in select mode opens `SinglePhotoView` as it does today.
- Long-press on a tile enters select mode after the hold threshold.
- The pressed tile becomes selected immediately once select mode is entered.

### Selection Extension

- While the pointer is held after select-mode activation, moving across tiles selects the contiguous visible range between the anchor tile and the current tile.
- Range behavior follows the rendered gallery order, including left-to-right movement across wrapped rows.
- `Shift` click extends selection from the anchor tile to the clicked tile using the same contiguous visible range logic.
- `Ctrl`/`Cmd` click toggles only the clicked entity and preserves the rest of the selection.

### Selection Persistence Rules

- Background state keeps both `photoIds` and `groupIds`.
- Group selections remain intact when toggling between grouped and ungrouped display modes.
- In grouped mode, group-selected canonical tiles render as selected.
- In ungrouped mode, only photo selections render directly; group selections remain stored for later grouped-mode actions.

## State Model

Introduce a library selection model shaped roughly as:

```ts
type LibrarySelectionState = {
  photoIds: Set<string>;
  groupIds: Set<string>;
  anchorKey: string | null;
};
```

Visible grid items should be projected into stable selection keys:

- `photo:<assetId>`
- `group:<groupId>`

This lets the grid interaction layer work on visible entities without needing to know whether a tile represents a photo or a group.

## Rendering Model

Add a gallery projection helper that:

- Accepts raw assets, sort mode, declustered assets, and the grouping toggle.
- Returns the ordered visible gallery items.
- Maps each visible tile to the backing entity key and selection metadata.

This keeps grouping/filtering concerns out of `LayoutEngine` and allows the selection logic to operate over a stable item model.

## Component Responsibilities

- `LibraryView`
  - Owns gallery display preferences like sort mode and grouped/ungrouped toggle.
  - Builds visible gallery items from raw assets.
  - Passes visible item metadata and selection state into the layout layer.

- `LayoutEngine`
  - Owns pointer/keyboard grid selection behavior over visible items.
  - Emits updated structured selection state rather than a raw photo-id set.

- `Tile`
  - Renders the selected star/frame treatment.
  - Shows group affordances consistently for grouped tiles.

- App shell
  - Replaces the existing `Set<string>` library selection state with the structured selection model.
  - Updates selection counts and downstream action wiring to understand both photo and group selections.

## Testing Strategy

Add focused test coverage for:

- Gallery projection in grouped and ungrouped modes.
- Selection range calculation over visible entity keys.
- Toggle/range behavior for `Ctrl`/`Cmd` click and `Shift` click.
- Selected tile visual metadata where feasible through model helpers.

Target small model/helper tests first so the pointer logic can stay lean and reviewable.

## Risks And Mitigations

- Risk: grouped/un-grouped mode switches could appear to lose selection.
  - Mitigation: persist group and photo selections independently and define rendering rules explicitly.

- Risk: current `LayoutEngine.tsx` grows beyond local complexity guardrails.
  - Mitigation: extract selection math and visible-item modeling into named helpers/modules before adding branches.

- Risk: drag selection could accidentally trigger navigation.
  - Mitigation: treat long-press as the only entry into select mode from idle; suppress navigation once select mode has started.
