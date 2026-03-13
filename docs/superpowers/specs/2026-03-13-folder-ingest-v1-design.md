# Folder Ingest V1 Design

**Date:** 2026-03-13

**Status:** Approved in brainstorming

**Related docs:**

- `docs/architecture.md`
- `docs/workflow-module-authoring-v2.md`
- `docs/superpowers/specs/2026-03-13-workflow-runtime-platform-design.md`
- `docs/superpowers/plans/2026-03-13-workflow-runtime-platform-foundation.md`

## Goal

Define the first real end-to-end ingest workflow on the new workflow runtime.

`folder_ingest_v1` should replace the old coordinator-led folder ingest as the
primary product workflow for this codebase. It must preserve output parity
where that matters to the product:

- same thumbnail sizes and preview behavior
- same Gemini prompt and metadata shape
- same canonical storage tables

It does not need to preserve old orchestration, old queue semantics, or old job
structure.

## Product intent

This is not a probe workflow. It is the central product path.

The user-facing experience must prove that the runtime works for a realistic
mix of:

- fast stages such as scanning and thumbnails
- moderate stages such as face detection and sensitivity analysis
- slower or externally limited stages such as AI metadata
- fan-in stages such as people resolution and similar-photo grouping

The workflow must be inspectable from the user perspective, not just the engine
perspective.

## Decisions

The approved decisions are:

- `folder_ingest_v1` is the real runtime path, not a shadow run
- the workflow is implemented natively in the new runtime, not by wrapping the
  old coordinator modules
- modules write directly to current canonical tables
- AI metadata supports `mock`, `live`, and `off`
- completion has two milestones: `Library ready` and `Enrichment complete`
- the engine remains generic, but workflows, modules, and subject types carry
  user-facing labels
- the workflow accepts explicit run parameters
- subfolder support is `folder_only` or `recursive` in v1

## Runtime invocation model

The workflow is invoked with:

- input subject: `folder`
- run parameters:
  - `folderPath: string`
  - `traversalMode: "folder_only" | "recursive"`
  - `aiMode: "mock" | "live" | "off"`

These parameters are stored on the `workflow_run`, visible in run inspection,
and available to modules that declare they need them.

## Workflow shape

The runtime graph is:

```text
folder
-> scan_folder
-> emit asset subjects
-> for_each asset -> generate_previews
-> milestone: Library ready

from assets after previews:
- for_each asset -> detect_faces
- for_each asset -> generate_face_vectors
- collect -> resolve_people
- collect -> group_similar_photos
- for_each asset -> detect_sensitive_content
- for_each safe asset -> generate_ai_metadata(mode=mock|live|off)

all enabled branches complete
-> milestone: Enrichment complete
```

### Semantics

- `scan_folder` is the only module that creates `asset` subjects in the run
- preview generation is the fast path that unlocks useful browsing
- sensitivity analysis gates AI metadata
- grouping and people resolution are explicit collect/fan-in stages
- batching is a runtime implementation detail, not a user-visible progress unit

## Subject and presentation model

The runtime uses internal subject types, but the user must never see raw engine
language such as `subject`, `subject execution`, or `artifact`.

### Internal subjects

Initial workflow subjects:

- `folder`
- `asset`

Future subjects may include:

- `person`
- `pet`
- `gravestone`
- `landmark`
- `memory`

### User-facing vocabulary

Presentation metadata is split across runtime contracts and UI formatting:

- subject types define default friendly names
- modules define friendly progress nouns and outcome labels
- workflows define milestone labels, step labels, and run summaries
- the UI formats those labels and never exposes engine internals

Examples for `folder_ingest_v1`:

- scanning uses `files discovered`
- preview generation uses `thumbnails generated` and `photos ready`
- face stages use `faces found` and `photos with faces`
- grouping uses `similar photo groups created`
- milestones are `Library ready` and `Enrichment complete`

The same internal subject can have different user-facing names by context:

- `asset` may be shown as `file` during scanning
- `asset` may be shown as `photo` during enrichment

## Runtime-native module split

The workflow should be implemented as distinct native modules, not one large
ingest job.

### Modules

`scan_folder`
: Input `folder`, output `asset`

`generate_previews`
: Input `asset`, writes preview rows and files

`detect_faces`
: Input `asset`, writes detection results

`generate_face_vectors`
: Input face-bearing `asset` or equivalent typed output from detection

`resolve_people`
: Fan-in step over face vectors, writes people assignments and grouping state

`group_similar_photos`
: Fan-in step over many assets, writes grouping rows

`detect_sensitive_content`
: Input `asset`, writes sensitivity results

`generate_ai_metadata`
: Input safe `asset`, writes AI metadata; behavior depends on `aiMode`

### Why this split

This boundary choice is deliberate:

- progress becomes meaningful
- failures are localizable
- later replacement of one stage is possible without redefining ingest
- future plugins can attach to a stable runtime model

## Storage model

The runtime replaces orchestration first, not storage first.

`folder_ingest_v1` writes directly to current canonical tables, including:

- `assets`
- `previews`
- `derived_results`
- `people`
- `face_assignments`
- grouping tables
- sensitivity-related canonical fields and supporting tables

The old coordinator queue and event flow are not the source of truth for this
workflow. The new runtime is.

## AI metadata modes

`generate_ai_metadata` supports three modes:

`mock`
: Produces deterministic fake metadata in the same structural shape as the real
  Gemini output contract.

`live`
: Calls Gemini using the real prompt and persistence behavior.

`off`
: Skips the AI metadata branch entirely.

### Why all three are required

- `mock` is necessary to validate orchestration, UI progress, and run
  inspection without API cost or rate-limit pressure
- `live` is necessary to prove parity with the real product path
- `off` is necessary for cases where the user wants ingest without AI metadata

`mock` must preserve output shape, not just return arbitrary placeholder text.

## Milestones and completion

The workflow has two user-facing completion milestones.

### `Library ready`

Reached when:

- folder scanning is complete
- preview generation is complete

This is the point where the user can meaningfully browse the imported folder.

### `Enrichment complete`

Reached when all enabled enrichment branches complete:

- face detection
- face vectors
- people resolution
- similar-photo grouping
- sensitivity analysis
- AI metadata if enabled

`aiMode` affects completion:

- `off` means the AI branch is skipped and does not block completion
- `mock` means the AI branch completes using fake responses
- `live` means the AI branch completes only after real model work

## Inspection and dashboard expectations

The runtime must be inspectable in user language.

Required projections:

- top-line run summary
- per-step progress and status
- milestone state
- failure and skip counts
- run configuration, including traversal mode and AI mode

Example summary:

`500 files scanned, 500 thumbnails generated, 127 faces found, 34 similar
photo groups created, 412 safe photos, 390 metadata results written`

Required drill-down:

- which files failed a step
- which files were skipped from AI metadata and why
- which groups were created
- which people assignments were resolved

## Error handling

The workflow must support partial usefulness without hiding real failures.

- scan and preview failures should surface quickly because they block `Library
  ready`
- enrichment failures should not erase `Library ready`
- AI rate-limit or API failures should be visible as step failures or skipped
  results, depending on mode and policy
- collect/fan-in stage failures must be attributable to that stage, not to the
  entire workflow in vague terms

## Non-goals for v1

`folder_ingest_v1` does not attempt to solve:

- plugin packaging
- arbitrary custom workflow editing
- non-folder entrypoints such as manual selection workflows
- new subject types such as `pet` or `gravestone`
- full budget enforcement beyond the `aiMode` branch choice

Those belong to later vertical slices.

## Recommended implementation order

The implementation should proceed in this order:

1. add `folder` subject support, run parameters, and workflow presentation
   metadata
2. replace the preview-only pilot with a real scan-to-preview ingest skeleton
3. add runtime-native per-asset enrichment modules
4. add collect/fan-in modules for people and similar-photo grouping
5. add AI mode switching with a deterministic mock implementation
6. add user-facing run inspection for milestone and step progress

This keeps the workflow user-useful early while still moving toward full parity.
