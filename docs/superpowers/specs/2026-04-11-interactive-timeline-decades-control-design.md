# Interactive Timeline Decades Control Design

## Goal

Replace the current timeline slider in the gallery date-sort view with a decade rail that behaves more like a scrollbar while staying tightly synced with the gallery viewport.

## Current Context

- `src/ui/components/library/LibraryTimelineRail.tsx` currently combines a vertical `<input type="range">` slider with passive decade density pills.
- `src/ui/components/library/libraryViewTimeline.tsx` already computes `viewportBucketIndex`, which reflects the decade currently visible at the top of the gallery viewport.
- `src/ui/components/LibraryView.tsx` updates that viewport decade on gallery scroll, keyboard scroll, and any other movement of the main scroll container.
- Timeline seeking already exists through `onGalleryTimelineSeek`, so the rail does not need new backend behavior to jump to a decade.

## Observed Problems

- The slider and the decade marks duplicate each other instead of forming one clear control.
- The visible decade labels are not directly interactive, so the user cannot click a decade to jump there.
- The current rail does not feel like a scrollbar because pointer interaction happens on the slider thumb, not on the decade track itself.
- The rail should reflect viewport movement while the user scrolls with the keyboard or native scrollbar, but the current presentation splits active state across different UI pieces.

## Approved Direction

Replace the mixed slider-plus-density rail with a single custom decade track:

- each decade row is directly clickable
- pointer down anywhere on the decade track begins scrubbing immediately
- holding and moving the pointer scrubs toward the pointer position continuously
- the highlighted decade follows the viewport while the gallery scrolls through keyboard input or the native scrollbar
- unknown-date navigation remains a separate button below the decade track

## Interaction Model

### Direct decade jumps

Clicking a decade row should seek the gallery to the start of that decade using the existing timeline seek contract.

### Scrub behavior

Pointer down on the track should capture the pointer, compute the hovered decade from the pointer position, and immediately seek to that decade. While the pointer remains held, pointer movement should continue updating the target decade so the rail feels like a scrubber rather than repeated page-step buttons.

### Viewport sync

When the gallery moves through keyboard scrolling, mouse wheel movement, trackpad gestures, or the native right-hand scrollbar, the selected decade on the rail should update from `viewportBucketIndex`. Scrubbing should temporarily show the draft decade while dragging, then return to normal viewport-driven sync once the pointer is released.

## Architecture

### 1. Replace the slider with a custom pointer-driven track

`LibraryTimelineRail.tsx` should own a single decade-track surface rather than rendering a native range input. The track will map pointer position to the underlying bucket index and route seeks through the existing `onSeekChange` callback.

### 2. Keep bucket math explicit and testable

Pointer-to-bucket calculations and displayed-label selection should live in small helpers so the rail remains reviewable and behavior can be tested without depending on DOM layout in every case.

### 3. Reuse existing viewport state

`viewportBucketIndex` already represents the decade near the top of the gallery. The rail should continue consuming that value instead of introducing another scroll observer.

## Visual Direction

- Remove the vertical slider entirely.
- Turn the decade list into the primary rail.
- Keep density indication through the decade row fill or background strength.
- Use one clear highlighted state for the active or scrubbed decade.
- Preserve the existing narrow side-rail footprint so the change fits the current gallery layout.

## Testing Strategy

Add targeted coverage for:

- pointer position to decade index mapping
- label selection while idle versus while scrubbing
- viewport index winning during ordinary scrolling
- scrubbed index driving seek callbacks during direct rail interaction

Manual verification should confirm:

- clicking any decade jumps to that decade
- click-and-hold scrubs as the pointer moves
- keyboard scrolling keeps the rail selection in sync
- native scrollbar movement keeps the rail selection in sync
- unknown-date navigation still works

## Out Of Scope

- changing backend seek semantics
- redesigning the gallery layout outside the timeline rail
- adding momentum, easing, or animated thumb physics
- changing how unknown-date assets are grouped
