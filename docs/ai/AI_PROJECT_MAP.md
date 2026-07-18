# AI Project Map

Last updated: 2026-07-16

## Product summary

PhotoStar2 is a local-first photo library management and analysis application built with React, TypeScript, Vite, and Tauri. It provides desktop runtime features for local storage, scanning, metadata extraction, face detection/recognition, duplicate/grouping analysis, and tag assignment, without requiring cloud reliance.

## Architecture layers

| Layer | Responsibility | Main locations |
| --- | --- | --- |
| **UI** | Renders state, collects intent, and presents workflow oversight. | `src/ui/` |
| **Boundary** | Defines contracts, transport, and message handling between UI and backend. | `src/boundary/`, `src/entrypoints/core/main.ts` |
| **Services** | Handles commands, executes workflow definitions, and projects runtime state. | `src/services/handlers/`, `src/services/workflowRuntime/` |
| **Data** | Stores catalog state, workflow runtime state, job history, and recent events. | `src/data/db.ts`, `src/services/events/` |

## Repository change lifecycle

- `docs/ai/change-workflow.md` is the operating guide for task creation,
  editor handoff, QA, runtime ownership, shipping, and cleanup.
- `docs/architecture/adr-002-agent-neutral-change-lifecycle.md` records the
  editor-neutral lifecycle decision.
- `qa:quick` is the fast edit loop, `qa:ready` evaluates the complete branch
  diff, and `qa:merge` is the canonical local and GitHub integration gate. The
  merge gate adds Oxlint multi-file cycle detection and application type-aware
  analysis while retaining typed ESLint and both TypeScript compiler projects.
- `task:audit` is read-only visibility across Git worktrees and task metadata;
  `task:reconcile` plans and safely removes only state proven stale or already
  integrated.
- The phrase `ship this change` instructs Codex or Antigravity to fix in-scope
  gate failures, integrate and push `main`, verify required checks and commit
  containment, stop the task-owned runtime, remove the task branch/worktree,
  reconcile stale state, and report any blocker precisely.
- Git refs and worktree state are authoritative. Editor, path, runtime, and port
  data are transferable task metadata, not separate editor-specific systems.

## Feature routing table

| User request mentions... | Start with these files | Also check | Relevant tests |
| --- | --- | --- | --- |
| **import / ingest** | `src/services/workflowRuntime/workflows/folderIngest.ts`, `src/entrypoints/core/main.ts` | `src/services/handlers/systemWorkflowRuntimeCommands.ts` | `tests/core/` |
| **gallery / browser** | `src/ui/components/LibraryView.tsx`, `src/ui/components/SinglePhotoView.tsx` | `src/services/handlers/assetCommands.ts` | `tests/ui/` |
| **thumbnails / previews** | `src/services/handlers/assetCommands.ts`, `src/services/workflowRuntime/` | `src/data/dbSchema.ts` (previews table) | `tests/core/` |
| **photo editing / restoration / masks** | `src/services/handlers/photoEditCommands.ts`, `src/services/photoEditing/editRenderer.ts` | `src/ui/components/photo-editor/`, `src/data/dbSchema.ts` | `tests/core/photo-edit-*.test.cjs`, `tests/repo/photo-editor-wiring.test.mjs` |
| **face detection / recognition** | `src/services/faces/`, `src/services/handlers/peopleCommands.ts` | `src/ui/components/PeopleView.tsx` | `tests/core/` |
| **duplicate detection / grouping** | `src/services/handlers/collectionCommands.ts`, `src/services/handlers/groupDiagnosticsCommands.ts` | `src/ui/components/AlbumsView.tsx` | `tests/core/` |
| **database / schema / migrations** | `src/data/dbSchema.ts`, `src/data/db.ts` | `src/services/events/` | `tests/core/` |
| **background jobs / workflows** | `src/services/workflowRuntime/`, `src/services/handlers/systemWorkflowRuntimeCommands.ts` | `src/data/dbSchema.ts` (workflow_runs) | `tests/core/` |
| **AI / local model integration** | `src/services/modelPaths.ts`, `src/services/tags/` | `src/services/photoDateEstimateAiText.ts` | `tests/core/` |
| **settings / configuration** | `src/ui/components/SettingsModal.tsx`, `src/services/handlers/systemCommands.ts` | `src/entrypoints/core/main.ts` | `tests/ui/` |
| **family tree / GEDCOM** | `src/ui/components/family-tree/FamilyTreeView.tsx`, `src/ui/components/family-tree/familyTreeHooks.ts` | `src/ui/components/family-tree/familyTreeLayout.ts`, `src/services/gedcom/` | `tests/core/`, `tests/ui/` |

## Core domain entities & Data Model

The application state is persisted in SQLite (`src/data/dbSchema.ts`).

| Table | Purpose | Keys / Links |
| --- | --- | --- |
| `assets` | Primary catalog of imported media files | PK: `id`, Links: `asset_identities.guid` via logic |
| `asset_identities` | Tracks canonical paths uniquely | PK: `guid`, Unique: `original_path` |
| `assets_manual` | Manual overrides (e.g., sensitivity) | PK: `identity_guid` -> `asset_identities.guid` |
| `previews` | Generated thumbnail/preview paths | PK: `asset_id, size` -> `assets.id` |
| `derived_results` | ML inferences (faces, AI metadata) | PK: `id`, FK: `asset_id` -> `assets.id` |
| `photo_metadata_projection` | Materialized view of aggregated photo metadata | PK: `asset_id` -> `assets.id` |
| `workflow_runs` | Executions of asynchronous workflows | PK: `id` |
| `workflow_run_milestones` | Checkpoints & progress for a workflow run | PK: `workflow_run_id, milestone_id` -> `workflow_runs.id` |
| `step_runs` | Individual step/module execution tracking | PK: `id`, FK: `workflow_run_id` |
| `subject_executions` | Tracking an individual subject through a step | PK: `id`, FK: `workflow_run_id`, `step_run_id` |
| `jobs` | High-level status for long-running workflows | PK: `id` |
| `people` | Recognized people catalog | PK: `id` |
| `face_assignments` | Linking a detected face in an asset to a person | PK: `asset_id, face_index` -> `assets.id`, `people.id` |
| `tag_definitions` | System vocabulary of tags | PK: `id`, Unique: `canonical_label` |
| `asset_tag_assignments` | Assignment of tags to assets | PK: `asset_id, tag_definition_id, source_kind` |
| `asset_groups` | Grouping definitions (e.g. albums, duplicates) | PK: `id`, FK: `canonical_asset_id` |
| `asset_group_members` | Assets belonging to a group | PK: `group_id, asset_id` |
| `asset_similarity_edges` | Precomputed similarity distances between assets | PK: `asset_id_a, asset_id_b, kind` |
| `albums` | User-created albums | PK: `id`, FK: `cover_asset_id` |
| `processing_issues` | Warnings/errors during background ingestion | PK: `id`, FK: `asset_id` |
| `photo_edit_documents` | Mutable non-destructive edit recipes and rendered-version lineage | PK: `id`, FK: source/rendered assets and parent edit |
| `photo_edit_styles` | Named reusable edit stacks and normalized mask recipes | PK: `id`, Unique: `name` |

## Non-destructive photo editor

- Edit stacks are ordered `PhotoEditOperation` recipes; source files are never modified.
- `PhotoEditorWorkspace.tsx` owns document loading, history, draft state, masks, preview requests, save, and render orchestration. Presentation routes through `PhotoEditorPreview.tsx` for fitted canvas/tool previews, `PhotoEditorSidebar.tsx` for tool settings and concertina panels, and `photoEditorTools.ts` for the shared tool catalogue and operation defaults.
- Preview and final render share `src/services/photoEditing/editRenderer.ts`. The renderer materializes every step so Sharp's internal operation ordering cannot change user stack order.
- Editor previews use a latest-only serial queue: slider gestures receive an immediate browser-side approximation, then one exact 900px render replaces it without concurrent backend preview work. Colour pop uses its shared pixel algorithm directly on a fitted client canvas for exact interactive feedback.
- The editor toolbar's `PhotoBeforeChangeButton.tsx` provides a momentary before-current-change comparison. It renders the selected operation's stack prefix while pointer or keyboard activation is held; ordinary tools, colour pop, and rotation retain the active canvas geometry to prevent comparison jumps, while crop intentionally uses an independently fitted source view.
- Tune image controls use `PhotoTuneOptions.tsx` with pure persisted-value conversion in `tuneImageControls.ts`: brightness, contrast, and saturation are presented as integer percentages from -100% to +100%, while hue uses a full-spectrum track, a hue-coloured thumb, a degree value, and a per-setting reset action.
- Crop editing uses `src/ui/components/photo-editor/PhotoCropOverlay.tsx`, `PhotoCropOptions.tsx`, crop option metadata in `cropOptions.ts`, and pure normalized geometry in `cropGeometry.ts`. Eight handles resize the frame, dragging inside pans the image underneath it, optional ratios constrain resizing in source-pixel space, and scalable composition guides stay clipped to the crop frame. One exact crop preview runs after the gesture settles.
- Rotation editing uses `PhotoRotateOverlay.tsx`, `PhotoRotateOptions.tsx`, and pure layout/straightening geometry in `rotationGeometry.ts`. Each rotate operation stores its angle, normalized pivot, horizontal/vertical flip state, fixed-or-expanded canvas choice, and exposed-pixel fill mode. The settings provide whole-degree fine rotation with Shift-modified five-degree snapping, centre-origin angle feedback, 90-degree actions, and flip actions; the renderer applies flips before rotation in stack order at preview and full resolution.
- Colour pop uses `PhotoColourPopOptions.tsx`, `PhotoColourPopOverlay.tsx`, and the shared deterministic pixel pipeline in `src/shared/photoEditing/colourPop.ts`. Users keep colours by clicking the original-colour image or its quantized palette, then tune colour range and edge transition. Selected RGB values are packed into numeric recipe slots so stacks and styles remain portable; all other pixels are converted to Rec. 709 monochrome by the same algorithm used for interactive preview and full-resolution rendering.
- The editor sidebar uses accessible concertina sections. Tools and the selected tool's settings are mutually exclusive so the active controls get the available vertical space; layers, masks, styles, and version output retain independent expansion state.
- Every selected tool preview and controls panel is hosted inside `PhotoEditorToolBoundary.tsx`. A tool render or state-update failure is replaced locally with inline retry feedback, while the editor shell, history, layers, masks, and unsaved edit stack remain mounted. New tools inherit this containment through the shared editor dispatch points.
- Mask editing uses `PhotoMaskPanel.tsx`, `PhotoMaskOverlay.tsx`, and `maskCandidates.ts`. Rectangle, ellipse, and polygon masks are drawn directly over the fitted preview; saved masks remain visible and selectable on that canvas. Automatic candidates enumerate the persisted `runtime.detect_frame` photo boundary plus every usable face, projected subject, and region-of-interest box already present on the `Asset` payload.
- A final render creates or updates a normal `assets` row and standard previews. Its locked `edit_version` asset group becomes canonical, and `edit_version` outranks similarity groups in gallery visibility.
- Reusable styles persist recipe snapshots in `photo_edit_styles`.
- Dehaze uses a deterministic dark-channel-prior filter; Colour pop uses selective colour retention against a monochrome image. Neither invokes AI models, and both remain compatible with stack masks and reusable styles.

## Workflows and Modules

The `workflowRuntime` acts as the single orchestration path. It executes defined **Workflows**, which consist of configurable **Modules**.

### Defined Workflows (`src/services/workflowRuntime/workflows/`)

- `folderIngestWorkflow`: Orchestrates importing files from a folder and scheduling subsequent analyses.
- `libraryPreviewWorkflow`: Specifically focused on generating preview images (thumbnails, display sizes).
- `libraryFaceWorkflow`: Analyzes assets for face detection and recognition.
- `libraryAiMetadataWorkflow`: Runs generic AI description, caption, or semantic tagging models on assets.
- `libraryGroupingWorkflow`: Identifies duplicate or similar photos and creates `asset_groups`.
- `libraryPhotoDateWorkflow`: Heuristically estimates missing creation dates based on multiple signals.
- `librarySensitiveScanWorkflow`: Scans library for sensitive/NSFW content to flag or blur.
- `assetPreviewWorkflow`: Targeted run for generating previews for a single or specified asset list.
- `selectedSubjectMetadataWorkflow`: Runs metadata extraction on specific user-selected items.

### Defined Modules (`src/services/workflowRuntime/modules/`)

- `scanFolderModule`: Scans filesystem and emits subject entries for valid media.
- `extractEmbeddedMetadataModule`: Reads EXIF/IPTC metadata embedded in files.
- `generatePreviewsModule`: Downscales assets using Sharp to standard dimensions.
- `detectFacesModule`: Locates faces using models (e.g., MediaPipe/TFJS).
- `generateFaceVectorsModule`: Computes facial embeddings for detected faces.
- `resolvePeopleModule`: Groups face vectors to existing or new `people` entities.
- `groupSimilarPhotosModule`: Computes and compares image hashes/features to detect duplicates.
- `detectSensitiveContentModule`: Evaluates assets against NSFW classifiers.
- `estimatePhotoDateModule`: Combines EXIF, file dates, and AI analysis to find best-guess photo dates.
- `generateAiMetadataModule`: Generates captions and tags using a VLM/LLM.
- `expandSelectionModule`: Helper to fetch nested subjects or expand grouping relationships.
- `previewAdapterModule`: Bridges generic items into the preview generation format.

## Cross-cutting rules and invariants

- **Single Architecture Source:** Follow `docs/architecture.md` as the definitive guide.
- **UI visual hierarchy:** Avoid rectangles within rectangles. When a framed container contains only another framed container, remove the redundant boundary and use spacing, typography, dividers, or a single state accent for grouping. Keep frames where they communicate an interaction, editable field, selection, or genuinely distinct region.
- **Workflow Runtime:** Use the `workflow_runs` orchestration model; do not revert to legacy `task_queue` structures.
- **UI Non-blocking:** Do not block the main/UI thread during long-running data analysis.
- **Data integrity:** Schema changes in `src/data/dbSchema.ts` require inline SQL migrations in `MIGRATIONS` array and respective TS type updates.
- **Idempotency:** Background runs (especially imports and metadata scans) should ideally be idempotent and resumable on interruption.

## Areas needing verification

- If exploring new deployment environments (e.g., mobile), verify transport layer boundaries.
- The precise bounds of "albums" vs "asset_groups" (duplicates vs intentional collections).
