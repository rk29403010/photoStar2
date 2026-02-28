# Ingest Performance – Two-Phase Scheduling Instruction

**Audience:** Antigravity implementation

**Status:** Mandatory optimisation pass

**Problem statement:**
Apparent performance is poor during ingest because heavy workflows (face detection/recognition, clustering) are competing with folder scanning and preview generation. Users experience long delays before photos appear usable, even for moderate libraries (~400 files).

This document defines a **two-phase ingest scheduling model** that preserves correctness while dramatically improving perceived performance.

---

## 1. Principle (Non-Negotiable)

> **Visibility first, enrichment later.**

Folder scanning and preview generation must be prioritised so that the library becomes usable as quickly as possible. Heavy analysis must be deferred until this condition is met.

---

## 2. Required Change: Two-Phase Ingest

### Phase 1 – Fast Path (Critical)

**Goal:** Make all media visible and scrollable as quickly as possible.

**Includes:**

- Folder scan
- Media record creation
- Preview generation (thumbnails / lightweight previews)

**Explicitly excludes:**

- Face detection
- Face embedding
- Face matching
- Face clustering
- Any other heavyweight AI or CPU/GPU-intensive processing

**Scheduling rules:**

1. `FolderScanRequested` triggers scanning only
2. For each file:
   - Emit `MediaDiscovered`
   - Immediately enqueue preview generation
3. Preview generation tasks:
   - Must be short-lived
   - May be batched aggressively
   - Must not be blocked by other workflows

**Exit condition for Phase 1:**

- Folder scan complete **and**
- All `MediaDiscovered` events emitted

At this point, the library must show:

- All items
- Previews either rendered or clearly pending

---

### Phase 2 – Slow Path (Deferred)

**Goal:** Perform enrichment without harming interactivity.

**Includes:**

- Face detection
- Face embedding
- Face matching
- Face clustering

**Scheduling rules:**

1. Phase 2 must not begin until Phase 1 exit condition is met
2. Tasks must be:
   - Rate-limited
   - Background-priority
   - Interruptible
3. Processing order:
   - Oldest-first or least-recently-viewed-first (implementation choice)

**Batching:**

- Batching windows (e.g. 10–30s) are acceptable here
- Latency is secondary to system stability

---

## 3. Coordinator Behaviour Changes

The Coordinator must become **phase-aware**.

### 3.1 New internal ingest state

The Coordinator tracks, per ingest session:

```ts
type IngestPhase = "fast" | "slow";
```

Initial state: `fast`

Transition to `slow` only after Phase 1 exit condition.

---

### 3.2 Event handling changes

| Event | Phase | Action |
|---|---|---|
| MediaDiscovered | fast | Enqueue preview only |
| MediaDiscovered | slow | Enqueue preview + face detection |
| FolderScanCompleted (internal signal) | fast → slow | Allow slow-path workflows |

**Note:** `FolderScanCompleted` is an **internal coordinator signal**, not a domain event.

---

## 4. Explicit Prohibitions

The following are not allowed during Phase 1:

- FaceDetectionRequested
- FaceEmbeddingGenerated
- FaceMatched
- FaceClusteringUpdated

These events must be deferred until Phase 2.

---

## 5. UI Expectations

During Phase 1:

- Library fills quickly
- Thumbnails appear progressively
- Face-related badges show `Pending`

During Phase 2:

- Subtle background progress only
- No large visible stalls
- No blocking spinners

---

## 6. Why This Is Required (Implementation Rationale)

- 400 files is a normal use case
- Users judge performance by **time to usable library**, not by enrichment completeness
- Running all workflows concurrently causes resource contention and poor apparent performance

This change trades **total completion time** for **dramatically improved perceived performance**, which is the correct UX optimisation.

---

## 7. Definition of Done

This change is complete when:

- 400 photos become visible in seconds, not minutes
- Preview generation completes without being starved
- Face analysis clearly runs later and more slowly
- UI feels responsive throughout ingest

No further optimisation is in scope until this behaviour is achieved.
