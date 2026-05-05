# AI Project Map

Last updated: 2026-05-05

## Product summary

PhotoStar2 is a local-first photo library management and analysis application built with React, TypeScript, Vite, and Tauri. It provides desktop runtime features for local storage, scanning, metadata extraction, face detection/recognition, duplicate/grouping analysis, and tag assignment, without requiring cloud reliance.

## Architecture layers

| Layer | Responsibility | Main locations |
| --- | --- | --- |
| **UI** | Renders state, collects intent, and presents workflow oversight. | `src/ui/` |
| **Boundary** | Defines contracts, transport, and message handling between UI and backend. | `src/boundary/`, `src/entrypoints/core/main.ts` |
| **Services** | Handles commands, executes workflow definitions, and projects runtime state. | `src/services/handlers/`, `src/services/workflowRuntime/` |
| **Data** | Stores catalog state, workflow runtime state, job history, and recent events. | `src/data/db.ts`, `src/services/events/` |

## Feature routing table

| User request mentions... | Start with these files | Also check | Relevant tests |
| --- | --- | --- | --- |
| **import / ingest** | `src/services/workflowRuntime/workflows/folderIngest.ts`, `src/entrypoints/core/main.ts` | `src/services/handlers/systemWorkflowRuntimeCommands.ts` | `tests/core/` |
| **gallery / browser** | `src/ui/components/LibraryView.tsx`, `src/ui/components/SinglePhotoView.tsx` | `src/services/handlers/assetCommands.ts` | `tests/ui/` |
| **thumbnails / previews** | `src/services/handlers/assetCommands.ts`, `src/services/workflowRuntime/` | `src/data/dbSchema.ts` (previews table) | `tests/core/` |
| **face detection / recognition** | `src/services/faces/`, `src/services/handlers/peopleCommands.ts` | `src/ui/components/PeopleView.tsx` | `tests/core/` |
| **duplicate detection / grouping** | `src/services/handlers/collectionCommands.ts`, `src/services/handlers/groupDiagnosticsCommands.ts` | `src/ui/components/AlbumsView.tsx` | `tests/core/` |
| **database / schema / migrations** | `src/data/dbSchema.ts`, `src/data/db.ts` | `src/services/events/` | `tests/core/` |
| **background jobs / workflows** | `src/services/workflowRuntime/`, `src/services/handlers/systemWorkflowRuntimeCommands.ts` | `src/data/dbSchema.ts` (workflow_runs) | `tests/core/` |
| **AI / local model integration** | `src/services/modelPaths.ts`, `src/services/tags/` | `src/services/photoDateEstimateAiText.ts` | `tests/core/` |
| **settings / configuration** | `src/ui/components/SettingsModal.tsx`, `src/services/handlers/systemCommands.ts` | `src/entrypoints/core/main.ts` | `tests/ui/` |

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
- **Workflow Runtime:** Use the `workflow_runs` orchestration model; do not revert to legacy `task_queue` structures.
- **UI Non-blocking:** Do not block the main/UI thread during long-running data analysis.
- **Data integrity:** Schema changes in `src/data/dbSchema.ts` require inline SQL migrations in `MIGRATIONS` array and respective TS type updates.
- **Idempotency:** Background runs (especially imports and metadata scans) should ideally be idempotent and resumable on interruption.

## Areas needing verification

- If exploring new deployment environments (e.g., mobile), verify transport layer boundaries.
- The precise bounds of "albums" vs "asset_groups" (duplicates vs intentional collections).
