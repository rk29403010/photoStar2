# Background Jobs UX + Drop‑in Implementation Spec

This document collates **UX guidance, behavioural rules, data models, and a minimal React + Tailwind implementation** for long‑running background jobs (bulk ingest, watched folders, face detection, enrichment pipelines).

It is written as a **handoff to Antigrav**: implement literally, avoid scope creep, and prioritise perceived responsiveness over internal accuracy.

---

## 1. UX Principles (Non‑Negotiable)

### 1.1 Human perception thresholds

| Time | User perception | UX requirement |
|---|---|---|
| ≤100 ms | Instant | No feedback required |
| 100–300 ms | Responsive | Subtle visual change |
| 300 ms–1 s | Delay noticed | Explicit acknowledgement |
| 1–2 s | Doubt begins | Clear feedback required |
| 2–10 s | Attention drifts | Progress + reassurance |
| >10 s | Feels stalled | Continuous feedback mandatory |

**Rule:** If the UI does not change within **~300–500 ms**, users assume the click failed.

---

### 1.2 Core rule

> Silence is worse than approximation.

UI feedback must be **time‑based**, not event‑based. Users need evidence of life every **≤1–3 seconds** while watching.

---

## 2. Global UX Model

### 2.1 Two surfaces, one system

1. **Task Drawer (global)**
   - Shows *jobs*, not files
   - Persistent, collapsible, non‑blocking
   - Scales from 1 → 100k files

2. **Per‑item status (local)**
   - Media appears immediately
   - Small badge/overlay: `Processing`, `Warning`, `Error`
   - Never blocks viewing or interaction

---

### 2.2 Ingest philosophy

- Files appear in the library **as soon as indexed**
- Enrichment (faces, quality, clustering) is **progressive**
- No pipeline stage blocks visibility

Enhancements should feel like *improvements*, not gates.

---

## 3. Job + Stage State Model

### 3.1 Job states

```
queued → starting → running → completed
              ↘ paused
              ↘ retrying
              ↘ failed
              ↘ cancelled
```

A job may complete **with warnings or errors**.

Only `fatal` errors fail a job.

---

### 3.2 Stage states

| State | Meaning |
|---|---|
| idle | Not started |
| queued | Waiting |
| running | Active |
| succeeded | Completed OK |
| warning | Completed with issues |
| failed | Failed but job may continue |
| skipped | Intentionally skipped |

---

### 3.3 Severity policy

| Severity | Behaviour |
|---|---|
| info | Diagnostic only |
| warning | Non‑fatal, user may ignore |
| error | Item failed, job continues |
| fatal | Job cannot proceed |

---

## 4. Progress Representation (Critical)

### 4.1 Never bind UI directly to file events

Problems:

- Fast stages cause flicker
- Slow stages cause silence

**Solution:** decouple internal truth from user‑visible progress.

---

### 4.2 Soft / weighted progress bars

- Indeterminate until first milestone
- Then bounded using **stage weights**
- Progress may advance even if a stage is slow

This is deliberate and acceptable.

---

### 4.3 Recommended stage weights (initial)

| Stage | Weight |
|---|---:|
| Index / dedupe | 2 |
| Thumbnail | 2 |
| Metadata | 1 |
| Quality / content AI | 2 |
| Face detection | 4 |
| Face embedding | 4 |
| Face matching | 6 |
| Similarity clustering | 5 |
| Remote enrichment | 2 |

---

### 4.4 UI update cadence

- UI animation tick: **250 ms**
- Job progress refresh: **1 s**
- No visible UI remains static for >10 s

---

## 5. Canonical Frontend Data Contract (TypeScript)

```ts
export type JobState =
  | "queued" | "starting" | "running" | "paused" | "retrying"
  | "completed" | "failed" | "cancelled";

export type StageState =
  | "idle" | "queued" | "running" | "succeeded" | "warning" | "failed" | "skipped";

export type IssueSeverity = "info" | "warning" | "error" | "fatal";

export type JobKind =
  | "bulk_ingest"
  | "watched_folder_ingest"
  | "reindex"
  | "face_analysis"
  | "similarity_cluster";

export interface JobIssue {
  id: string;
  severity: IssueSeverity;
  message: string;
  detail?: string;
  mediaIds?: string[];
  stageId?: string;
  createdAt: string;
  action?: { label: string; kind: "open_settings" | "retry" | "show_items" };
}

export interface StageProgress {
  stageId: string;
  label: string;
  state: StageState;
  total?: number;
  done?: number;
  lastHeartbeatAt?: string;
  weight?: number;
}

export interface JobProgress {
  overallTotal?: number;
  overallDone?: number;
  overallPercent?: number;
  indexed?: number;
  analysed?: number;
  facesFound?: number;
  facesRecognised?: number;
  warnings?: number;
  errors?: number;
  stages: StageProgress[];
}

export interface BackgroundJob {
  id: string;
  kind: JobKind;
  title: string;
  state: JobState;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  trigger: "user" | "system";
  source?: { type: "folder" | "device" | "api"; label: string };
  progress: JobProgress;
  issues: JobIssue[];
  canPause?: boolean;
  canCancel?: boolean;
  canRetry?: boolean;
}
```

---

## 6. React + Tailwind Drop‑in Components

### 6.1 Component list (minimal)

1. `TaskDockButton`
2. `TaskDrawer`
3. `JobRow`
4. `ProgressBarSoft`
5. `StageList` (collapsed by default)
6. `IssueBadge`
7. `MediaStatusBadge`

---

### 6.2 ProgressBarSoft.tsx

```tsx
import React from "react";

export function ProgressBarSoft({
  percent,
  indeterminate,
}: {
  percent?: number;
  indeterminate?: boolean;
}) {
  return (
    <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
      {indeterminate ? (
        <div className="h-full w-1/3 bg-blue-500 animate-pulse" />
      ) : (
        <div
          className="h-full bg-blue-500 transition-all duration-500"
          style={{ width: `${Math.min(100, percent ?? 0)}%` }}
        />
      )}
    </div>
  );
}
```

---

### 6.3 JobRow.tsx

```tsx
import { BackgroundJob } from "./types";
import { ProgressBarSoft } from "./ProgressBarSoft";

export function JobRow({ job }: { job: BackgroundJob }) {
  const indeterminate = job.progress.overallPercent == null;

  return (
    <div className="border-b border-gray-200 py-3">
      <div className="flex justify-between items-center mb-1">
        <div className="font-medium">{job.title}</div>
        <div className="text-xs text-gray-500 capitalize">{job.state}</div>
      </div>

      <ProgressBarSoft
        indeterminate={indeterminate}
        percent={job.progress.overallPercent}
      />

      <div className="text-xs text-gray-600 mt-1 flex gap-3">
        {job.progress.indexed != null && <span>{job.progress.indexed} indexed</span>}
        {job.progress.analysed != null && <span>{job.progress.analysed} analysed</span>}
        {job.progress.facesRecognised != null && (
          <span>{job.progress.facesRecognised} faces</span>
        )}
        {job.progress.warnings ? <span>{job.progress.warnings} warnings</span> : null}
      </div>
    </div>
  );
}
```

---

### 6.4 TaskDrawer.tsx

```tsx
import { BackgroundJob } from "./types";
import { JobRow } from "./JobRow";

export function TaskDrawer({ jobs }: { jobs: BackgroundJob[] }) {
  return (
    <div className="fixed bottom-0 right-0 w-96 max-h-[70vh] bg-white shadow-xl border-l border-t border-gray-200">
      <div className="p-3 border-b font-semibold">Background Tasks</div>
      <div className="overflow-y-auto">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}
```

---

### 6.5 MediaStatusBadge.tsx

```tsx
export function MediaStatusBadge({ state }: { state: "processing" | "warning" | "error" }) {
  const map = {
    processing: "bg-blue-500",
    warning: "bg-yellow-500",
    error: "bg-red-500",
  };

  return (
    <div className={`absolute top-1 right-1 px-2 py-0.5 text-xs text-white rounded ${map[state]}`}>
      {state}
    </div>
  );
}
```

---

## 7. Behavioural Rules (Implementation Checklist)

- [ ] UI reacts within **≤300 ms** to any click
- [ ] No visible UI remains static for **>10 s**
- [ ] Files appear immediately after indexing
- [ ] Enrichment never blocks visibility
- [ ] Errors are local and non‑blocking
- [ ] Job completion allowed with warnings

---

## 8. Definition of Done (Anti‑Scope‑Creep)

This system is **done** when:

- A 1‑file ingest and a 10,000‑file ingest use the same UI
- Face recognition taking 10–20 seconds never feels stalled
- Users never feel the need to click twice
- Jobs can be ignored without anxiety

No further UI complexity is required unless user research proves otherwise.
