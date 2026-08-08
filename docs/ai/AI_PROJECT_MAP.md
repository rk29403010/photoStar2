# AI Project Map

Last updated: 2026-07-21

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
- `docs/architecture/adr-005-progressive-feature-delivery-and-ui-smoke.md`
  records the conversational feature-delivery and targeted browser-boot policy.
- `docs/ai/feature-delivery-playbook.md` is the task-card and coordinator guide
  for `explore`, `build`, and `harden` delivery phases.
- `qa:quick` is the fast edit loop, `qa:ready` evaluates the complete branch
  diff, and `qa:merge` is the canonical local and GitHub integration gate.
  `qa:quick` includes native TypeScript 7 app and core checks so type failures
  appear with the edit that caused them. The
  merge gate adds Oxlint multi-file cycle detection and application type-aware
  analysis while retaining typed ESLint and both TypeScript compiler projects.
- `thread:publish` is the non-blocking publication command; `thread:ship` is
  its compatibility alias. `task:audit` reports attention-only task state and
  `task:reconcile` plans or applies only containment-proven cleanup.
- The authoritative lifecycle vocabulary is in `docs/ai/change-workflow.md`:
  task capsule, leaf task, integration task, published, merge-queued, merged,
  cleanup-pending, and blocked. Publication records the PR number plus exact
  published/base SHAs; reconciliation later proves integration from origin.
- `ship this change` authorizes deterministic publication and merge submission;
  it does not require either editor to remain attached while GitHub checks run.
  Remote automation owns check observation, merge completion, and later cleanup
  reconciliation.
- Git refs and worktree state are authoritative. Editor, path, runtime, and port
  data are transferable task metadata, not separate editor-specific systems.
- `thread:new-integration` and `thread:new-leaf` derive integration bases from
  task state; `task:overlap` compares active branch diffs without mutation.
  Main-push automation advances only clean, explicitly labelled queued PRs.
- `task:start` creates or resumes an editor-neutral registered worktree, and
  `task:register` records a suitable editor-created worktree. Git and the task
  registry, rather than an editor capability claim or directory convention,
  discover the active workspace.
- `ui:smoke` launches an isolated desktop runtime and headless browser only for
  affected UI/runtime changes at readiness and integration. It detects browser
  errors, blank roots, startup failures, and missing app-shell markers without
  slowing `qa:quick`.

### TypeScript tooling

- `@typescript/native` aliases stable TypeScript 7 for command-line
  checks and CommonJS core builds. The quality orchestrator owns compiler
  selection; package scripts and CI call its modes.
- `typescript` remains at 5.9.3 for programmatic API consumers such as
  `typescript-eslint`. `typecheck:compat` verifies that API-consumer
  path; normal `qa:*` checks use the native compiler.
- TypeScript 6 API adoption is deferred because it changes complete-repository
  typed-lint results. Remove the API compiler only after programmatic consumers
  explicitly support TypeScript 7 and the complete gate prove it is no longer
  required. Use `benchmark:quality -- --typechecks-only` to
  compare the compatibility and native compiler paths on the current machine.

## Extension architecture

- Workflow modules, photo-editing tools, and future extension families use
  self-contained plug-ins behind extension contracts. Hosts orchestrate
  discovered plug-ins but do not encode individual IDs, labels, defaults, UI
  components, or algorithms.
- Registries are discovered or deterministically generated. Generated registries
  are machine-owned, reproducible outputs; edit declared inputs and generators,
  never generated registry files.
- Reduce shared edit hotspots. Assign disjoint scopes to peer leaf tasks; use an
  integration task and branch when related leaves share host, contract, or
  registry integration files.

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
| **Segmentation providers** | `src/services/segmentation/`, `docs/architecture/segmentation-providers.md` | `tooling/scripts/core/export_fastsam_s_model.py` | `tests/core/fastsam-provider-contract.test.cjs` |
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

- Start future tool work with [PHOTO_EDITOR_TOOL_GUIDE.md](./PHOTO_EDITOR_TOOL_GUIDE.md). It documents the required file shape, editor entry points, settings and canvas-interaction standards, automatic-suggestion rules, error containment, workflow feedback, and external-AI disclosure requirements.
- Edit stacks are ordered `PhotoEditOperation` recipes; source files are never modified.
- Photo tools are registered from manifests under `src/services/photoEditing/tools/plugins/`; run `pnpm.cmd run photo-tool:generate-registry` then `photo-tool:check-registry`. The generated registry is machine-owned. All twelve known tools are supplied by this registry; unknown persisted tool IDs remain visible as unavailable and their data is preserved.
- `PhotoEditorWorkspace.tsx` owns document loading, history, draft state, masks, preview requests, save, and render orchestration. Presentation routes through `PhotoEditorPreview.tsx` for fitted canvas/tool previews and `PhotoEditorSidebar.tsx` for settings and concertina panels; tool metadata and defaults resolve from the generated registry.
- Preview and final render share `src/services/photoEditing/editRenderer.ts`. The renderer materializes every step so Sharp's internal operation ordering cannot change user stack order.
- Editor previews use a latest-only serial queue: slider gestures receive an immediate browser-side approximation, then one exact 900px render replaces it without concurrent backend preview work. Colour pop uses its shared pixel algorithm directly on a fitted client canvas for exact interactive feedback.
- The editor toolbar's `PhotoBeforeChangeButton.tsx` provides a momentary before-current-change comparison. It renders the selected operation's stack prefix while pointer or keyboard activation is held; ordinary tools, colour pop, and rotation retain the active canvas geometry to prevent comparison jumps, while crop intentionally uses an independently fitted source view.
- Tune image controls use `PhotoTuneOptions.tsx` and zero-centred `TUNE_IMAGE_DEFAULTS`: Guided offers six plain-English, restrained controls and Advanced offers all twelve controls in collapsible sections. `tune.ts` applies the deterministic shared renderer in order: temperature, tint, points, tonal regions, brightness, contrast, vibrance, saturation, hue.
- Crop editing uses `src/ui/components/photo-editor/PhotoCropOverlay.tsx`, `PhotoCropOptions.tsx`, crop option metadata in `cropOptions.ts`, and pure normalized geometry in `cropGeometry.ts`. Eight handles resize the frame, dragging inside pans the image underneath it, optional ratios constrain resizing in source-pixel space, and scalable composition guides stay clipped to the crop frame. One exact crop preview runs after the gesture settles.
- Rotation editing uses `PhotoRotateOverlay.tsx`, `PhotoRotateOptions.tsx`, and pure layout/straightening geometry in `rotationGeometry.ts`. Each rotate operation stores its angle, normalized pivot, horizontal/vertical flip state, fixed-or-expanded canvas choice, and exposed-pixel fill mode. The settings provide whole-degree fine rotation with Shift-modified five-degree snapping, centre-origin angle feedback, 90-degree actions, and flip actions; the renderer applies flips before rotation in stack order at preview and full resolution.
- Colour pop uses `PhotoColourPopOptions.tsx`, `PhotoColourPopOverlay.tsx`, and the shared deterministic pixel pipeline in `src/shared/photoEditing/colourPop.ts`. Users keep colours by clicking the original-colour image or its quantized palette, then tune colour range and edge transition. Selected RGB values are packed into numeric recipe slots so stacks and styles remain portable; all other pixels are converted to Rec. 709 monochrome by the same algorithm used for interactive preview and full-resolution rendering.
- Effects use `PhotoEffectsOptions.tsx`, `PhotoEffectsOverlay.tsx`, and the shared deterministic pixel pipeline in `src/shared/photoEditing/effects.ts`. Ripple, sunburst, lens flare, and light leak recipes store a normalized focal point plus numeric parameters, render immediately on the fitted client canvas, and use the same algorithm for full-resolution output.
- Focus uses `PhotoFocusOptions.tsx`, `PhotoFocusOverlay.tsx`, and the shared deterministic pixel pipeline in `src/shared/photoEditing/focus.ts`. Circular and straight focal zones support up to five draggable centres, visual size/falloff/angle handles, inversion, Tilt-shift and group presets, and natural, radial-zoom, directional, or orbital blur styles.
- Red eye uses `PhotoRedEyeOptions.tsx`, `PhotoRedEyeOverlay.tsx`, and `src/shared/photoEditing/redEye.ts`. It scans the upper portions of persisted face boxes for red human-eye reflections or bright green/yellow pet-eye reflections, then stores editable normalized eye points in the non-destructive recipe.
- Automatic editing is available as an `Automatic` tool in the editor tool grid. The host extracts neutral image and metadata observations, then collects safe, deterministic suggestions from generated tool plug-ins. Providers own their operation values, rationale, confidence, placement, update policy, and geometry requirements; failures are contained per provider. Suggestions remain reviewable and become normal non-destructive Layers & changes only after selection.
- The editor sidebar uses accessible concertina sections. Tools and the selected tool's settings are mutually exclusive so the active controls get the available vertical space; layers, masks, styles, and version output retain independent expansion state.
- Every selected tool preview and controls panel is hosted inside `PhotoEditorToolBoundary.tsx`. A tool render or state-update failure is replaced locally with inline retry feedback, while the editor shell, history, layers, masks, and unsaved edit stack remain mounted. New tools inherit this containment through the shared editor dispatch points.
- Mask editing uses `PhotoMaskPanel.tsx`, `PhotoMaskOverlay.tsx`, and `maskCandidates.ts`. Rectangle, ellipse, and polygon masks are drawn directly over the fitted preview; saved masks remain visible and selectable on that canvas. Analysis modules persist source-scoped `asset_mask_metadata` records with a versioned, labelled normalized contract; candidates can carry PNG alpha rasters for precise silhouettes as well as geometry fallbacks. The editor merges this into `Asset.mask_metadata`, uses it for labelled choices and alpha-aware canvas hit testing, and snapshots the selected mask into the edit document so later analysis runs cannot alter an existing edit.
- A final render creates or updates a normal `assets` row and standard previews. Its locked `edit_version` asset group becomes canonical, and `edit_version` outranks similarity groups in gallery visibility.
- Reusable styles persist recipe snapshots in `photo_edit_styles`. Each known operation carries its plug-in recipe version; loading resolves declared migrations and validation through the registry. Unknown, future, or invalid operations stay preserved and visibly unavailable while the available remainder remains inspectable and applicable.
- Dehaze uses a deterministic dark-channel-prior filter; Colour pop uses selective colour retention against a monochrome image. Neither invokes AI models, and both remain compatible with stack masks and reusable styles.

## Workflows and Modules

## Segmentation providers

Local segmentation providers live in `src/services/segmentation/`; functional use is through `runtime.detect_frame`, `runtime.segment_objects`, and `library_editor_masks_v1`. See `docs/architecture/segmentation-providers.md` for tiers, storage, provenance, and future-provider guidance.

The `workflowRuntime` acts as the single orchestration path. It executes defined **Workflows**, which consist of configurable **Modules**.

Workflow modules are registered through `WorkflowModulePlugin` directories under
`src/services/workflowRuntime/modules/plugins/`. Their `manifest.ts` files are
the authoritative registration inputs; run `pnpm.cmd run module:generate-registry`
after adding a plug-in and `pnpm.cmd run module:check-registry` in verification.
The generated registry is machine-owned. Every active workflow module is
registered through this registry; obsolete compatibility registration is not a
supported extension path. Unknown persisted IDs and version migrations remain
generic resilience boundaries.

The maintenance UI projects registered plug-in manifests through
`get_workflow_module_repository`; `ModuleMaintenanceWorkspace.tsx` renders
module properties and links each consuming workflow back to `WorkflowWorkspace`.
Workflow-node `parameters` are projected as the selected module's current
settings in `WorkflowDetailPanel.tsx`.

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
- `plugins/expand-selection`: Plug-in-owned helper to fetch nested subjects or expand grouping relationships.
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
