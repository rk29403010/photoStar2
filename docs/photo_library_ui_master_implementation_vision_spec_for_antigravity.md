# Photo Library UI – Master Implementation & Vision Spec

**Audience:** Antigravity (implementation)

**Purpose:**
This document is the *single source of truth* for building the Photo Library UI. It combines:

- What **must be implemented now**
- What is **explicitly future-facing**
- What must **not** be improvised, overbuilt, or guessed

The intent is to enable confident implementation **without reinterpretation**.

---

# Part A – Implementation Spec (Build Now)

These features are approved, scoped, and expected to ship.

They are intentionally conservative, calm, and respectful of source material.

---

## A1. Core layout model

- Use a **12-unit grid system** (12 columns, fixed auto-rows).
- Layout must be **deterministic and scroll-stable**.
- Tiles occupy integer column × row spans.
- Mixed aspect ratios are preserved using `object-contain` by default.
- Cropping is never destructive and never automatic unless explicitly flagged safe.

**Tile intents:**

- Utility
- Normal
- Emphasis
- Hero

Layout logic consumes *intent*, not raw AI scores.

---

## A2. Quality-weighted mosaic view (primary view)

- Chronological ordering is preserved.
- Visual prominence is driven by a derived **TileIntent**.
- Rules:
  - At most one Hero tile per viewport window.
  - Heroes may not be adjacent.
  - Bursts are placed as a single compound tile.

This view should feel **editorial**, not algorithmic.

---

## A3. Plain grid view (secondary view)

- Uniform tile sizing (e.g. 3×3 units).
- No filenames, captions, or overlays.
- Minimal hover affordance only.

Purpose: fast scanning and archival clarity.

---

## A4. Bursts as compound tiles

- A burst represents **time**, not alternatives.
- One anchor image per burst.
- Burst tile may render as:
  - Static image (default)
  - Animated burst thumbnail (if enabled)

Rules:

- Animation is idle-only.
- Animation pauses on hover, scroll, or focus.
- Expanded bursts open **inline**, not in a new context by default.

---

## A5. Scoring & intent classification

- Multiple raw signals (aesthetic, sharpness, faces, uniqueness, user bias).
- Signals are softly blended into a **finalScore**.
- finalScore is mapped to **TileIntent**.

Layout must not consume raw scores directly.

User bias always dominates AI-derived scores.

---

## A6. Variants & restorations

- Variants *orbit* a canonical original image.
- Variants never receive their own grid tile.
- Layout decisions are never influenced by variants.

Variant types are semantic only:

- Clean
- Repair
- Enhance
- Colourise
- Upscale
- Composite
- Crop

Expanded image view shows a **variant stack** (before/after scrub or side-by-side).

---

## A7. Variant preference propagation (conservative)

- Propagation occurs only on **explicit user action**.
- No inference from passive behaviour.
- Preference scopes:
  - Image
  - Burst / Group
  - Album
  - Global

Similarity matching is coarse and boolean (era, subject class, colour mode).
Propagation is soft, capped, and reversible.

---

## A8. Provenance & trust signalling

Three trust levels:

1. **Mosaic view**
   - No labels
   - Optional subtle icon on hover

2. **Expanded image view**
   - Plain-language line (e.g. “AI-assisted restoration”)
   - Optional second line if uncertainty exists

3. **Inspect mode**
   - Full provenance
   - Confidence expressed only as Low / Medium / High

Originals remain the ground truth for identity and clustering.

---

## A9. Motion & animation language

- One global easing curve.
- Three duration bands (micro / short / medium).
- Prefer crossfade over transforms.
- Tile entry: fade + slight rise.

Explicitly disallowed:

- Bounce or spring easing
- Ken Burns effects
- Parallax scrolling
- Auto-zoom on faces

Respect `prefers-reduced-motion` everywhere.

---

## A10. Video support (baseline)

- Video treated as **photo + time**.
- Poster frame only in mosaic and grid views.
- No autoplay.
- Inline playback only after explicit user action.
- Muted by default.

---

## A11. Feature flags (guardrails)

Feature classes:

- Structural (always on)
- Behavioural (user-toggleable)
- Experiential (bundled under Beautiful Mode)

**Beautiful Mode:**

- Default OFF
- Presentation only
- One master toggle
- Must not affect sorting, scoring, identity, or persistence

---

# Part B – Dreams Spec (Capture, Do Not Build Yet)

Everything in this section is **explicitly out of scope for now**.

The architecture should avoid blocking these ideas, but they must not delay or contaminate Part A.

---

## B1. Micro-3D depth for variants

- Variants subtly offset behind originals on the Z-axis.
- Small perspective (800–1200px).
- Max Z offset 6–12px.
- Activated only on hover or inspect.

Purpose: communicate derivation without labels.

---

## B2. Ambient sound & video ambience

- Extract low-level ambient sound from videos.
- No speech or music by default.
- Sound fades in only when scroll is idle.
- Immediate fade-out on fast scrolling.

---

## B3. Seasonal / contextual theming

Examples:

- Autumn: warm paper tones, subtle leaf texture
- Winter: cooler whites, increased grain

Rules:

- Section-based, not per-image
- Very slow transitions
- Never more than one theme active

---

## B4. Physical photo treatments

- Polaroid-style frames on a small percentage of tiles.
- Gentle random skew (≤ 2°).
- Used sparingly and only in Beautiful Mode.

---

## B5. Print-inspired visual system

- Paper textures
- Ink density
- Grain models

Goal: bridge screen and memory-book aesthetics.

---

## B6. Advanced restoration audit trails

- Timeline of edits
- Visual diffs
- Tool and operator attribution

Target audience: archivists and power users.

---

# Part C – Handover Guardrails (What Not To Do)

This section exists to prevent accidental erosion of intent.

---

## C1. Non-negotiable mental models

- Images tell **stories**, not inventories.
- Layout consumes **intent**, not raw scores.
- Variants orbit originals; they never compete.
- Bursts are compound tiles, not equals.
- Originals are the ground truth.

If a change violates these, stop and ask.

---

## C2. Layout anti-patterns (do not implement)

- Masonry / Pinterest-style grids
- Justified galleries
- Randomised tile placement
- Dynamic reflow during scroll

---

## C3. Motion anti-patterns

- Bounce or elastic easing
- Continuous looping animation
- Parallax
- Auto-scroll
- Zooming on faces

If motion draws attention to itself, it is wrong.

---

## C4. Variants & AI misuse

- No AI badges shouting in the UI
- No confidence percentages outside Inspect mode
- No re-clustering people on variants
- No layout decisions influenced by variants

---

## C5. Video misuse

- No autoplay
- No audio without explicit opt-in
- No layout promotion solely due to video

---

## C6. When to stop and ask

Stop implementation and seek clarification if:

- A feature feels “cool” but not necessary
- A decision requires guessing user intent
- A shortcut violates any mental model above
- A visual treatment draws attention to itself

---

## C7. North star

> “Would this still feel respectful if someone were browsing family photos quietly, alone?”

If the answer is no, don’t ship it.

---

# Final note

This document separates:

- **Correctness** (Part A)
- **Possibility** (Part B)
- **Discipline** (Part C)

Part A must ship cleanly on its own.

Everything else is optional, reversible, and explicitly gated.
