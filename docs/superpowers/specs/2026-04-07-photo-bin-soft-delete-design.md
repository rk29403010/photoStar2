# Photo Bin Soft Delete Design

## Goal

Allow users to remove photos from the visible library without deleting the original files by introducing a reversible bin workflow.

## Problem

The library currently has no concept of removing a photo from the browsable collection without deleting the source file. Albums are additive only, so a photo placed in a "bin" album would still continue to appear in the main library and in other albums.

The requested behavior needs three things to work together:

- deleting a photo should hide it from normal browsing immediately
- the hidden photo should remain recoverable from a dedicated bin surface
- the user should get an immediate undo affordance after deletion

## Constraints

- Deleting from the library must never remove the original file from disk.
- The bin should feel like part of the existing Albums area rather than a separate top-level mode.
- Binned photos must not appear in the library, people-driven library views, tag filters, or normal albums.
- Users must be able to restore photos both from the immediate undo affordance and later from the bin.
- The implementation should build on the existing album and asset query architecture rather than introducing a parallel collection system.

## Proposed Design

### Bin as a system album plus asset state

Introduce a built-in, protected `Bin` album that appears in the Albums view and cannot be renamed or deleted. The bin is the user-facing entrypoint, but bin membership alone is not the source of truth for visibility.

Each asset also gets a persistent `binned_at` timestamp field. A photo is considered binned when `binned_at` is not null. Moving a photo to the bin does two things atomically:

- set `assets.binned_at`
- add the asset to the system bin album

Restoring reverses both operations atomically:

- clear `assets.binned_at`
- remove the asset from the system bin album

This keeps the UX album-shaped while making global exclusion reliable.

### Visibility rules

Normal asset queries should exclude binned assets by default. This includes:

- the main library
- person-filtered library results
- tag-filtered library results
- counts shown in album cards
- album item queries for non-bin albums

The bin album is the one exception: when the active filter points at the system bin album, the library view should show only binned assets from that album.

This means photos keep their existing album memberships while binned, but those memberships are effectively hidden until restore. A restored photo reappears in its prior albums automatically because the original album associations were never deleted.

### User interactions

Deleting to bin should be available in two places:

- the library selection bar for bulk actions
- the single-photo overlay action menu for the current photo

The action wording should make the non-destructive behavior clear, for example `Move to Bin`.

When a delete completes, the status bar should show a temporary message that includes an inline action, for example `Moved 3 photos to Bin. Undo`. Clicking the action restores that batch. If the action is not used, the message can expire after a short interval.

When the user opens `Bin` from the Albums area, they can select one or more photos and restore them. Restore should also be available for a single photo while browsing the bin.

### Status bar message model

The existing status bar only displays plain text. Replace that with a lightweight status-banner model that supports:

- message text
- optional action label
- optional action callback
- optional auto-dismiss timeout

Existing plain status messages can be mapped into this model without changing their visible behavior.

This lets undo reuse the existing status bar placement instead of adding a new toast system.

## Backend changes

### Schema

Add `binned_at TEXT` to the `assets` table through the schema bootstrap path used by the local database. Keep the change additive so existing libraries migrate safely.

Extend the album model to support a system bin record. The simplest version is an `albums` row with a stable reserved id plus metadata that marks it as system-managed.

### Commands

Add backend commands for:

- moving asset ids to the bin
- restoring asset ids from the bin
- ensuring the system bin album exists

These commands should use transactions so that the asset flag and album membership never drift apart.

### Query behavior

Centralize the "exclude binned unless the active filter is the bin album" rule in the asset query helpers and album queries so the UI does not need to remember this rule per screen.

## Frontend changes

### Albums view

Update the albums list to surface the bin album as a first-class card. The card should:

- be visible even if empty
- open like any other album
- avoid showing the destructive delete-album affordance
- communicate that it is a system collection

### Library actions

Add `Move to Bin` as a bulk selection action in the filter bar and as a single-photo action in the overlay menu.

When the active album filter is the bin album, replace that action with `Restore` in the relevant bulk and single-photo surfaces.

### Selection and detail recovery

Deleting the currently selected photo will remove it from the visible result set. The existing selection-recovery behavior should continue to clear vanished selections, but bin-driven removal should surface the new undo banner rather than a generic "no longer available" message.

## Error handling

- If moving to bin fails, leave the UI unchanged and show an error status message.
- If restore fails, keep the photo in the bin and show an error status message.
- If the bin album record is missing unexpectedly, backend commands should recreate it before continuing.
- If a user attempts to delete the system bin album through a stale UI path, the backend should reject it explicitly.

## Testing Strategy

### Backend

- schema coverage for the new asset column and system bin bootstrap
- command tests for move-to-bin and restore transactions
- query tests proving binned assets disappear from normal library and album results
- query tests proving the bin album shows only binned assets

### Frontend

- status bar tests for inline undo actions
- albums view tests for the protected bin card
- action-model tests for showing `Move to Bin` versus `Restore`
- integration-oriented component tests for restoring from a bin-filtered library selection

## Why this design

This approach preserves the user's requested mental model that the bin lives in Albums, while avoiding the main failure mode of a pure album-based solution: binned photos leaking into normal library views. The asset-level flag gives the backend one clear visibility rule, and the system album gives the UI a familiar place to browse and restore hidden photos.
