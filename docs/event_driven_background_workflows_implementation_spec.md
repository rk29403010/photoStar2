# Event‑Driven Background Workflows – Implementation Spec

**Audience:** Antigravity implementation

**Purpose:** Replace batch‑oriented background jobs with an event‑driven, workflow‑coordinated model that allows immediate library visibility, progressive enrichment, and configurable pipelines.

This document is **normative**. Implement as written. No discussion, alternatives, or UX debate belong here.

---

## 1. Core Goals

1. Files appear in the library **as soon as they are discovered** (indexed), not when a batch completes.
2. All background processing is **event‑driven**, not batch‑gated.
3. Processing is expressed as **workflows**, not monolithic jobs.
4. A **Coordinator** determines what happens next based on workflow definition and current state.
5. Heavy work is decoupled, parallelisable, and clusterable (e.g. preview generation).

---

## 2. Conceptual Model

### 2.1 Key concepts

| Concept | Meaning |
|---|---|
| Workflow | A declarative definition of steps and reactions to events |
| Event | A fact that something has happened (file discovered, preview ready, faces detected) |
| Task | A concrete unit of work executed by a worker |
| Coordinator | Orchestrates workflows by reacting to events |
| Worker | Performs tasks and emits events |

---

## 3. Workflows

### 3.1 What a workflow is

A **workflow** defines:

- Which events it listens to
- What tasks should be scheduled when those events occur
- Any conditions, batching, or throttling rules

Workflows are **data**, not code.

---

### 3.2 Initial required workflows

#### 3.2.1 Ingest workflow (mandatory)

**Trigger:** `FolderScanRequested`

**Behaviour:**

1. Scan folder
2. For each file discovered:
   - Create minimal media record (id, path, hash, timestamps)
   - Emit `MediaDiscovered`
3. No enrichment blocks library visibility

---

#### 3.2.2 Preview workflow

**Trigger:** `MediaDiscovered`

**Behaviour:**

- Schedule preview generation
- Coordinator may batch multiple preview requests
- Emit `PreviewGenerated`

---

#### 3.2.3 Face analysis workflow (sub‑workflow)

**Trigger:** `MediaDiscovered`

**Stages:**

1. Face detection
2. Face embedding
3. Face matching
4. Face clustering

Each stage emits its own event.

Failures at any stage:

- Do not block other stages
- Do not block library visibility

---

## 4. Events (Canonical Set)

Events are append‑only facts.

```ts
export type DomainEvent =
  | { type: "FolderScanRequested"; folderId: string }
  | { type: "MediaDiscovered"; mediaId: string }
  | { type: "PreviewRequested"; mediaIds: string[] }
  | { type: "PreviewGenerated"; mediaId: string }
  | { type: "FaceDetectionRequested"; mediaId: string }
  | { type: "FaceDetected"; mediaId: string; faceCount: number }
  | { type: "FaceEmbeddingGenerated"; mediaId: string }
  | { type: "FaceMatched"; mediaId: string; matches: number }
  | { type: "FaceClusteringUpdated"; clusterId: string }
  | { type: "TaskFailed"; taskId: string; severity: "warning" | "error" | "fatal" };
```

---

## 5. Coordinator

### 5.1 Responsibilities

The **Coordinator**:

- Subscribes to domain events
- Loads active workflow definitions
- Decides what tasks to enqueue next
- Applies batching and throttling rules

The Coordinator **does not**:

- Perform heavy work
- Maintain UI state
- Block on task completion

---

### 5.2 Example: Ingest flow

1. `FolderScanRequested`
2. Worker scans folder
3. Emits `MediaDiscovered` per file
4. Coordinator reacts:
   - Emits `PreviewRequested` (batched)
   - Emits `FaceDetectionRequested` per media

---

### 5.3 Batching rules (required)

The Coordinator **may**:

- Group multiple `PreviewRequested` events into one task
- Delay scheduling by a short window (e.g. 250–500 ms) to allow batching

Batching is **transparent** to the workflow definition.

---

## 6. Tasks

### 6.1 Task characteristics

| Property | Requirement |
|---|---|
| Idempotent | Yes |
| Stateless | Preferable |
| Retryable | Yes (unless fatal) |
| Emits events | Always |

Tasks never update domain state directly.

---

### 6.2 Task lifecycle

```
queued → running → succeeded
                ↘ failed (warning | error | fatal)
```

On completion or failure, a task **must emit an event**.

---

## 7. Jobs (UI‑Facing Only)

### 7.1 What a job is

A **job** is a **projection** for UI purposes only.

- Jobs are derived from events
- Jobs group related tasks (e.g. an ingest session)
- Jobs do not drive execution

---

### 7.2 Job behaviour

- A job may complete while work continues
- A job may complete with warnings or errors
- Jobs must show activity within ≤1 s of user action

---

## 8. Progress & Feedback Rules

### 8.1 Library visibility

- Media records appear immediately after `MediaDiscovered`
- Missing previews or faces are shown as *pending*, not blocked

---

### 8.2 Progress semantics

- Progress is **time‑smoothed**
- Progress is **approximate by design**
- No UI surface waits on a full workflow to complete

---

## 9. Persistence

Minimum required persistence:

- Event log (append‑only)
- Media table (minimal fields at discovery)
- Task table (ephemeral, retryable)

Workflows may be re‑driven by replaying events.

---

## 10. Libraries / Patterns to Use (Non‑Prescriptive)

The architecture must align with:

- Event sourcing concepts
- Message / task queues
- Workflow orchestration patterns

Specific libraries are **implementation choices**, but the model must remain event‑driven and coordinator‑led.

---

## 11. Definition of Done

This system is **done** when:

- Files appear in the library before enrichment completes
- Ingest does not wait for preview or face analysis
- Preview generation can be batched transparently
- Face analysis runs as an independent sub-workflow
- UI progress is driven by events, not batch completion

No additional features are in scope.

---

## 12. Canonical Event Set (Locked)

This section defines the **minimal, sufficient, stable** event vocabulary. Implement **exact names and payloads**. No aliases. No overloading.

### 12.1 Event design rules

- Events are facts; only `*Requested` expresses intent
- Past tense for facts, imperative for requests
- Append-only
- Small, immutable payloads

---

### 12.2 Core domain events

#### Ingest / discovery

```ts
type FolderScanRequested = {
  type: "FolderScanRequested";
  folderId: string;
  scanSessionId: string;
};
```

```ts
type MediaDiscovered = {
  type: "MediaDiscovered";
  mediaId: string;
  scanSessionId: string;
};
```

---

#### Preview pipeline

```ts
type PreviewRequested = {
  type: "PreviewRequested";
  mediaIds: string[];
  reason: "ingest" | "repair" | "rebuild";
};
```

```ts
type PreviewGenerated = {
  type: "PreviewGenerated";
  mediaId: string;
};
```

```ts
type PreviewFailed = {
  type: "PreviewFailed";
  mediaId: string;
  severity: "warning" | "error";
};
```

---

#### Face analysis pipeline

```ts
type FaceDetectionRequested = {
  type: "FaceDetectionRequested";
  mediaId: string;
};
```

```ts
type FacesDetected = {
  type: "FacesDetected";
  mediaId: string;
  faceCount: number;
};
```

```ts
type FaceEmbeddingGenerated = {
  type: "FaceEmbeddingGenerated";
  mediaId: string;
  faceId: string;
};
```

```ts
type FaceMatched = {
  type: "FaceMatched";
  mediaId: string;
  faceId: string;
  personId: string | null;
  confidence: number;
};
```

```ts
type FaceClusteringUpdated = {
  type: "FaceClusteringUpdated";
  clusterId: string;
};
```

---

#### Task execution

```ts
type TaskStarted = {
  type: "TaskStarted";
  taskId: string;
  taskKind: string;
};
```

```ts
type TaskCompleted = {
  type: "TaskCompleted";
  taskId: string;
};
```

```ts
type TaskFailed = {
  type: "TaskFailed";
  taskId: string;
  severity: "warning" | "error" | "fatal";
  reason: string;
};
```

---

### 12.3 Explicitly not events

The following must not exist:

- MediaImported
- IngestCompleted
- WorkflowCompleted
- AllFacesProcessed
- Any batch-finished signal

Completion is inferred by projection, never signalled.

---

## 13. Mapping to Antigravity Job / Task Model

This section defines **what is kept, adapted, or replaced** in Antigravity.

### 13.1 Jobs

| Aspect | Old Meaning | New Meaning |
|---|---|---|
| Purpose | Execution driver | UI projection only |
| Lifecycle | Start → complete | Derived from events |
| Completion | Hard gate | Soft / inferred |

**Action:** Adapt. Jobs must not drive execution.

---

### 13.2 Tasks

| Aspect | Status |
|---|---|
| Execution unit | Keep |
| Retryable | Keep |
| Side effects | Must emit events only |

Tasks must never update domain state directly.

---

### 13.3 Workers

Workers remain unchanged. They execute tasks and emit events.

---

### 13.4 What must be added

- Coordinator (event subscriber and task scheduler)
- Persistent event log
- Declarative workflow definitions

---

### 13.5 What must be removed

- Batch-oriented ingest jobs
- Job-completion-gated visibility
- Progress tied to batch completion

---

### 13.6 Invariant

**No user-visible media state may depend on job completion.**

Only `MediaDiscovered` controls library visibility.

---

## 14. Projections (Authoritative)

Projections are **read models** derived from events. They never drive execution.

---

### 14.1 Library Item Projection

**Source of truth:** event log

**Invariant:** Library visibility is controlled **only** by `MediaDiscovered`.

| Field | Derived from |
|---|---|
| visible | MediaDiscovered |
| previewStatus | PreviewGenerated / PreviewFailed / absence |
| faceStatus | FacesDetected and downstream events |
| warnings | warning-level failures |
| errors | error or fatal failures |

Rules:

- On `MediaDiscovered`, create item immediately
- Missing previews or faces never hide items

---

### 14.2 Media Badge Projection

Badges are derived, never stored.

Priority order: `Error > Warning > Processing`

---

### 14.3 Job Projection (UI-only)

Jobs are synthetic groupings for reassurance.

Create jobs from:

- FolderScanRequested
- User-triggered root workflow events

Jobs complete visually when no related events occur for a short quiet window.

---

### 14.4 Progress Projection

Progress is approximate and time-smoothed. No UI waits on full workflow completion.

---

## 15. Failure Model (Locked)

Failures degrade capability, never visibility.

### 15.1 Severity meanings

| Severity | Effect |
|---|---|
| warning | Continue |
| error | Skip item, continue |
| fatal | Stop scheduling in that workflow |

---

## 16. Ingest Workflow – Failure Semantics

| Failure | Severity | Behaviour |
|---|---|---|
| File unreadable | warning | Skip file |
| Hash failure | warning | Create record without hash |
| Folder access lost | fatal | Stop ingest |

---

## 17. Preview Workflow – Failure Semantics

| Failure | Severity | Behaviour |
|---|---|---|
| Unsupported format | warning | No preview |
| Decode error | error | Skip preview |
| Repeated crash | fatal | Pause preview workflow |

---

## 18. Face Analysis Workflow – Failure Semantics

### 18.1 Face Detection

| Failure | Severity | Behaviour |
|---|---|---|
| No faces | info | Emit zero faces |
| Detection error | warning | Skip pipeline |
| Model load failure | fatal | Stop face workflow |

### 18.2 Face Embedding

| Failure | Severity | Behaviour |
|---|---|---|
| Per-face failure | warning | Skip face |
| Repeated model failure | fatal | Stop embedding |

### 18.3 Face Matching

| Failure | Severity | Behaviour |
|---|---|---|
| No match | info | personId=null |
| Matcher error | warning | Skip match |
| DB unavailable | error | Retry |

### 18.4 Face Clustering

| Failure | Severity | Behaviour |
|---|---|---|
| Conflict | warning | Retry later |
| Index corrupt | fatal | Disable clustering |

---

## 19. Retry Policy

| Severity | Retry |
|---|---|
| warning | No auto-retry |
| error | Exponential backoff |
| fatal | Never auto-retry |

---

## 20. Invariant

**Failures degrade capability, never visibility.**
