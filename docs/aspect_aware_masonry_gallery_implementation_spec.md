# Aspect-aware Masonry Gallery – Implementation Specification

This document defines the **locked implementation** for the image gallery layout system, optimised for **fast import**, **progressive enrichment**, and **long-term visual quality** using an **aspect-aware masonry grid** as the backbone.

It is written to minimise interpretation and prevent premature over-engineering.

---

## 1. Chosen Baseline (Locked Decision)

- **Layout:** Aspect-aware masonry
- **Rationale:**
  - Works immediately with width/height only
  - Handles extreme vintage aspect ratios gracefully
  - Supports progressive semantic upgrades without layout mode switches

This layout is the **only global layout mode**. All future behaviour is incremental and local.

---

## 2. Geometry-first Placement Rules (Phase 0)

Phase 0 applies immediately on file discovery.

### Available data

- Image width
- Image height
- File type

### Derived metric

```ts
aspectRatio = width / height
```

### Column behaviour (ratio-based only)

| Aspect ratio (w/h) | Placement rule |
| --- | --- |
| < 0.45 | Full-row span (very wide images) |
| 0.45 - 0.75 | Eligible for 2-column span |
| 0.75 - 1.30 | Standard single-column |
| > 1.30 | Tall portrait (single column) |

### Hard constraints

- Aspect ratio must never be distorted
- No cropping of any kind
- No semantic assumptions
- No hero treatment

Phase 0 must be:

- Deterministic
- Fast
- Independent of AI or background processing

---

## 3. Progressive Enhancement Model (Required)

Images gain **capabilities over time**. They never switch layout modes.

### Image state (conceptual)

```ts
Image {
  width
  height
  aspectRatio
  processingPhase // 0 | 1 | 2
  layoutCapabilities {
    canCropSafely
    canSpanColumns
    prefersMount
    heroEligible
  }
}
```

Capabilities are **derived**, never editorially assigned.

---

## 4. Phase 1 – Low-confidence Semantics

Triggered when any cheap signals arrive:

- Face count or rough face boxes
- Border / mount detection
- Blur, contrast, entropy metrics

### Newly allowed behaviours

#### 4.1 Micro-cropping

- Allowed crop range: **5–8%**
- Only if faces are detected
- Crop only from edges **furthest from face bounds**

#### 4.2 Document calming

If indicators suggest document / newspaper:

- High border density
- Uniform texture
- Low face confidence

Then:

- Prefer padded or mounted presentation
- Avoid edge-to-edge rendering

#### 4.3 Anti-hero protection

Images with:

- Very low entropy
- Extreme blur
- Near-black or near-white histograms

Must be explicitly **ineligible for hero treatment**.

Layout still visually matches Phase 0 masonry.

---

## 5. Phase 2 – Confident Semantics

Triggered once richer metadata is available:

- Reliable face boxes
- Subject confidence
- User interaction signals (likes, edits)

### Additional permissions

#### 5.1 Extended cropping

- Up to **10–15%**, still face-safe
- Used to improve balance and visual flow

#### 5.2 Selective column spanning

- Individual images may gain extra column width
- Never full-row unless already wide by ratio

#### 5.3 Hero eligibility (strict)

An image is hero-eligible **only if all apply**:

- Quality score above threshold
- Faces well framed
- Positive user interaction
- Not classified as document
- Not aggressively cropped

Hero behaviour:

- +1 column width maximum
- Extra surrounding whitespace
- Fade-in only (no jump reflow)

Heroes must be **rare and stable**.

---

## 6. Reflow Rules (Critical)

- Reflow must be **local only**
- Never reshuffle the entire grid when metadata updates
- Earlier rows must remain visually stable

If an image upgrades:

- Upgrade in place, or
- Apply on next natural reflow (scroll, resize)

No background-triggered global redraws.

---

## 7. White Space Policy

- Target acceptable negative space: **10–25%**
- Early white space = uncertainty (acceptable)
- Later white space = respect and calm

White space must not be globally optimised away.

---

## 8. React + Tailwind Implementation Primitives

### Core container

- CSS grid or masonry library with fixed column width
- Column count responsive to viewport

### Image card responsibilities

- Maintain intrinsic ratio box
- Accept optional crop window
- Accept optional padding / mount
- Support fade-in state transitions

### State-driven rendering

- Rendering decisions must depend only on:
  - aspectRatio
  - processingPhase
  - layoutCapabilities

No component may infer semantics independently.

---

## 9. Explicit Do-Not-Implement List

The following are **out of scope** and must not be implemented:

- ❌ Global layout mode switching
- ❌ Semantic grouping across images
- ❌ Aggressive auto-cropping
- ❌ Automatic hero selection without user signals
- ❌ Full-grid reflow on metadata updates
- ❌ Aesthetic optimisation that overrides stability

---

## 10. Design Intent (Non-Functional Requirement)

The gallery must feel:

- Stable from first import
- Calm, not algorithmic
- Progressively more intentional over time

Images should appear to **earn their place**, not be rearranged by surprise.

---

## 11. Acceptance Criteria (Minimal)

This implementation is considered complete when:

- Images display immediately after scan using width/height only
- No image ever changes aspect ratio
- Metadata enrichment improves layout locally without global reflow
- Extreme vintage formats (panoramas, documents) feel intentional, not broken

---

End of specification.
