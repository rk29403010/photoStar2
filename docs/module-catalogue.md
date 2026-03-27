# Module Catalogue

This catalogue describes the workflow-runtime modules currently registered in
PhotoStar, plus the legacy preview adapter that is still exposed through the
workflow runtime.

It is aimed at workflow designers, so each module entry focuses on purpose,
current usage, subjects and parameters, database state, settings, events, and
workflow-design notes.

## Runtime Model

- Registered subject types: `folder`, `asset`, `selection`
- Registered runtime modules: `runtime.scan_folder`,
  `runtime.expand_selection`, `runtime.extract_embedded_metadata`,
  `runtime.generate_previews`, `runtime.detect_faces`,
  `runtime.generate_face_vectors`, `runtime.resolve_people`,
  `runtime.group_similar_photos`, `runtime.detect_sensitive_content`,
  `runtime.generate_ai_metadata`, `legacy.preview.generate`
- Generic workflow bookkeeping tables:
  `workflow_runs`, `workflow_run_milestones`, `step_runs`,
  `subject_executions`
- Modules are invoked by workflow orchestration, not by event subscription
- When a module emits an event, it is persisted to `events` and forwarded to
  the frontend

## Workflow Entrypoints

### `folder_ingest_v1`

Command: `start_folder_ingest`

Path: `runtime.scan_folder` -> `runtime.generate_previews` ->
`runtime.extract_embedded_metadata` / `runtime.detect_faces` ->
`runtime.generate_face_vectors` -> `runtime.resolve_people` /
`runtime.group_similar_photos` / `runtime.detect_sensitive_content` ->
`runtime.generate_ai_metadata`

### `library_previews_v1`

Command: `start_library_preview_workflow`

Path: `runtime.generate_previews`

### `library_face_pipeline_v1`

Command: `start_library_face_workflow`

Path: `runtime.detect_faces` -> `runtime.generate_face_vectors` ->
`runtime.resolve_people`

### `library_grouping_v1`

Command: `start_library_grouping`

Path: `runtime.group_similar_photos`

### `library_sensitive_scan_v1`

Command: `start_library_sensitive_scan_workflow`

Path: `runtime.detect_sensitive_content`

### `library_ai_metadata_v1`

Command: `start_library_ai_metadata_workflow`

Path: `runtime.generate_ai_metadata`

### `selected_subject_metadata_v1`

Command: `start_selected_subject_metadata_workflow`

Path: `runtime.expand_selection` -> `runtime.generate_ai_metadata`

### `asset-preview`

Internal legacy workflow.

Path: `legacy.preview.generate`

## Shared Runtime Bookkeeping

Every workflow node execution writes generic runtime bookkeeping even if the
business module writes nothing else.

### `workflow_runs`

Fields: `id`, `workflow_id`, `trigger_type`, `status`, `input_subjects_json`,
`parameters_json`, `started_at`, `finished_at`, `created_at`

### `step_runs`

Fields: `id`, `workflow_run_id`, `node_id`, `status`, `expected_items`,
`error_message`, `created_at`, `updated_at`

### `subject_executions`

Fields: `id`, `workflow_run_id`, `step_run_id`, `subject_type`, `subject_id`,
`status`, `created_at`, `updated_at`

### `workflow_run_milestones`

Fields: `workflow_run_id`, `milestone_id`, `label`, `status`, `created_at`,
`updated_at`

## Module Reference

## `runtime.scan_folder`

Capability: `derive`

Accepts: `folder`

Produces: none

Used by: `folder_ingest_v1`

Parameters: `traversalMode` with `recursive` or `folder_only`

What it does: walks the input folder, filters to supported image extensions,
inserts missing assets into the library, and emits downstream `asset` subjects.

How to use it: place it at the start of a folder-based workflow, then follow it
with a `for_each` node because it fans one folder into many assets.

Reads from DB: `assets.id`, `assets.original_path`

Writes to DB: `assets.id`, `assets.original_path`, `assets.file_hash`,
`assets.file_size`, `assets.width`, `assets.height`, `assets.exif_datetime`,
`assets.created_at`

Persisted data: inserts a skeletal asset row with `file_hash = NULL`,
`width = 0`, `height = 0`, and `exif_datetime = NULL`

Settings: none directly

Events emitted: none

Events consumed: none directly

Useful notes:

- This module does not hash files, generate previews, or extract metadata
- It deduplicates by `assets.original_path`, not by content hash
- It emits new or existing assets in file-path sort order

## `runtime.expand_selection`

Capability: `derive`

Accepts: `selection`

Produces: none

Used by: `selected_subject_metadata_v1`

Parameters: `selectedSubjects`, required, array of
`{ subjectType, subjectId }`

What it does: expands a synthetic `selection` subject into concrete downstream
subjects and deduplicates repeated selections.

How to use it: put it at the front of workflows that start from UI selection
state rather than from durable stored subjects.

Reads from DB: none

Writes to DB: none

Persisted data: no persistence; returns `emittedSubjects`

Settings: none

Events emitted: none

Events consumed: none directly

Useful notes:

- V1 only supports `asset` subjects
- It throws if the selection is empty or includes unsupported subject types
- This is the current bridge from UI multi-select state into runtime workflows

## `runtime.extract_embedded_metadata`

Capability: `derive`

Accepts: `asset`

Produces: `embedded_metadata` artifact for `asset`

Used by: `folder_ingest_v1`

What it does: reads file metadata with `sharp` and `exif-parser`, normalizes
timestamps, updates core asset dimensions and timestamp fields, and stores a
structured embedded-metadata snapshot.

How to use it: run after scan or before any workflow that depends on
dimensions, capture timestamps, or EXIF/XMP context.

Reads from DB: `assets.id`, `assets.original_path`, `assets.file_size`

Writes to DB: `assets.file_size`, `assets.width`, `assets.height`,
`assets.exif_datetime`, `assets.metadata_timestamp_source`,
`derived_results.id`, `derived_results.asset_id`, `derived_results.task`,
`derived_results.provider`, `derived_results.model_version`,
`derived_results.data`

Persisted data:

- `derived_results.task = 'embedded_metadata'`
- `provider = 'sharp+exif-parser'`
- `model_version = '1.0'`
- `data` contains `schema_version`, `file`, `embedded`, and `derived`

Settings: none

Events emitted: `AssetUpdated`

Events consumed: none directly

Useful notes:

- This is the main module that turns a skeletal asset row into richer asset
  state
- It overwrites the prior `embedded_metadata` result for the asset
- On failure it returns no outputs instead of failing the workflow

## `runtime.generate_previews`

Capability: `derive`

Accepts: `asset`

Produces: `preview` artifact for `asset`

Used by: `folder_ingest_v1`, `library_previews_v1`

What it does: generates thumbnail and large preview files with `sharp` and
stores preview paths and versions.

How to use it: use early in visual workflows when the UI or downstream analysis
benefits from a previewable asset.

Reads from DB: `assets.id`, `assets.original_path`

Writes to DB: `previews.asset_id`, `previews.size`, `previews.path`,
`previews.version`

Persisted data:

- `thumbnail` preview at width `256`
- `large` preview at width `1080`
- current preview version is `4`

Settings: none

Events emitted: `WorkflowPreviewGenerated`

Events consumed: none directly

Useful notes:

- This is the workflow-native preview generator
- It does not write `processing_issues` or job status rows
- Prefer this over `legacy.preview.generate` for new workflows

## `legacy.preview.generate`

Capability: `derive`

Accepts: `asset`

Produces: `preview` artifact for `asset`

Used by: `asset-preview`

What it does: adapts the older preview worker into the workflow runtime by
delegating to `runPreviewWorker`.

How to use it: use only when you explicitly want legacy preview worker
behavior. New workflows should prefer `runtime.generate_previews`.

Reads from DB: indirect via preview worker. Main fields include `assets.id`,
`assets.original_path`, `previews.asset_id`, `previews.version`

Writes to DB: indirect via preview worker. Main fields include
`previews.asset_id`, `previews.size`, `previews.path`, `previews.version`,
`processing_issues.id`, `processing_issues.asset_id`,
`processing_issues.job_id`, `processing_issues.task`,
`processing_issues.severity`, `processing_issues.message`

Persisted data: same preview rows as `runtime.generate_previews`, plus fatal
`processing_issues` rows on preview failures

Settings: none

Events emitted: indirect legacy worker events including `JobStarted`,
`JobProgress`, `JobCompleted`, `PreviewGenerated`, `PreviewFailed`

Events consumed: none directly

Useful notes:

- This is a compatibility adapter, not the preferred module layer
- It is the only registered runtime module still depending on the older
  job-worker path

## `runtime.detect_faces`

Capability: `analyze`

Accepts: `asset`

Produces: `face_detection` artifact for `asset`

Used by: `folder_ingest_v1`, `library_face_pipeline_v1`

What it does: runs RetinaFace against the original asset file and stores face
boxes, scores, and landmarks.

How to use it: run before `runtime.generate_face_vectors`. If you plan to
resolve people, follow the embedding stage with a collect step.

Reads from DB: `assets.original_path`

Writes to DB: `derived_results.id`, `derived_results.asset_id`,
`derived_results.task`, `derived_results.provider`,
`derived_results.model_version`, `derived_results.data`,
`processing_issues.id`, `processing_issues.asset_id`,
`processing_issues.task`, `processing_issues.severity`,
`processing_issues.message`

Persisted data:

- `derived_results.task = 'face_detection'`
- `provider = 'onnx_retina_10g'`
- `model_version = '1.0'`
- `data.faces[]` contains `id`, `box`, `score`, `landmarks`

Settings: none

Events emitted: `FacesDetected`

Events consumed: none directly

Useful notes:

- It replaces the prior `face_detection` row each time it runs
- Detection failures become warning `processing_issues`
- Even on failure it still writes an empty face list and completes

## `runtime.generate_face_vectors`

Capability: `derive`

Accepts: `asset`

Produces: `face_vector` artifact for `asset`

Used by: `folder_ingest_v1`, `library_face_pipeline_v1`

What it does: loads detected faces, runs ArcFace embeddings for each usable
face crop, and persists one embedding entry per detected face.

How to use it: always place it after `runtime.detect_faces`, and collect the
results before person resolution if you want a batch clustering step.

Reads from DB: `assets.original_path`, `derived_results.data` where
`task = 'face_detection'`

Writes to DB: `derived_results.id`, `derived_results.asset_id`,
`derived_results.task`, `derived_results.provider`,
`derived_results.model_version`, `derived_results.data`,
`processing_issues.id`, `processing_issues.asset_id`,
`processing_issues.task`, `processing_issues.severity`,
`processing_issues.message`

Persisted data:

- `derived_results.task = 'face_recognition'`
- `provider = 'onnx_arcface_r50'`
- `model_version = '1.0'`
- `data.embeddings[]` maps to detected face index and contains `number[]` or
  `null`

Settings: none

Events emitted: `FaceEmbeddingGenerated`

Events consumed: none directly

Useful notes:

- If no faces exist, it still persists an empty embeddings array
- If the file is missing or the ArcFace model is unavailable, it records a
  recognition warning and completes
- Recognition issues are stored under `processing_issues.task = 'recognition'`

## `runtime.resolve_people`

Capability: `group`

Accepts: `asset`

Produces: `person_resolution` artifact for `asset`

Used by: `folder_ingest_v1`, `library_face_pipeline_v1`

Recommended node mode: `once_per_batch`

What it does: reads all available face embeddings, clusters them into people,
reuses prior person IDs where possible, applies manual overrides, and generates
person thumbnails.

How to use it: use as a batch module after a collect step over many assets.
Even though it accepts `asset`, it behaves as a whole-library clustering pass.

Reads from DB: `derived_results` face-recognition rows, `face_assignments`,
`manual_face_isolations`, `manual_face_names`, `assets`, `people`, and
`derived_results` face-detection rows for thumbnail generation

Writes to DB: `people.id`, `people.name`, `people.thumbnail_path`,
`face_assignments.asset_id`, `face_assignments.face_index`,
`face_assignments.person_id`, `face_assignments.confidence`

Persisted data:

- one `people` row per resolved cluster
- one `face_assignments` row per assigned face index per asset
- `confidence` is cosine similarity to cluster centroid

Settings: `job_cluster_threshold`, default fallback `0.65`

Events emitted: `FaceClusteringUpdated`

Events consumed: none directly

Useful notes:

- This operates over the entire current recognition corpus, not just the
  incoming asset
- It deletes and rebuilds `face_assignments` on each run
- It deletes `people` rows that no longer have assignments
- Manual overrides live outside the module in `manual_face_names` and
  `manual_face_isolations`

## `runtime.group_similar_photos`

Capability: `group`

Accepts: `asset`

Produces: `similar_group` artifact for `asset`

Used by: `folder_ingest_v1`, `library_grouping_v1`

Recommended node mode: `once_per_batch`

What it does: prepares grouping prerequisites such as file hashes, metadata,
and visual hashes, then rebuilds duplicate, near-duplicate, variant-set, and
burst groups for impacted assets.

How to use it: use as a batch module over assets whose grouping relationships
may have changed.

Reads from DB: `assets`, `asset_features`, `asset_groups`,
`asset_group_members`, `asset_group_children`, `asset_similarity_edges`

Writes to DB:

- prerequisite repair in `assets`, `asset_features`, and `processing_issues`
- grouping output in `asset_groups`, `asset_group_members`,
  `asset_group_children`, and `asset_similarity_edges`

Persisted data:

- `asset_features` stores `file_hash`, `phash64`, `dhash64`
- `asset_groups.type` may be `duplicate`, `near_duplicate`, `variant_set`,
  `burst`
- duplicate groups use `status = 'confirmed'`
- near-duplicate, variant, and burst groups use `status = 'proposed'`
- `asset_similarity_edges.kind` currently uses `visual`

Settings: none

Events emitted: none

Events consumed: none directly

Useful notes:

- This is batch-oriented and should stay batch-oriented
- It skips regrouping when impacted assets are already in locked groups
- Canonical choice differs by group type: quality for duplicate-like groups,
  recency for variant and burst groups

## `runtime.detect_sensitive_content`

Capability: `analyze`

Accepts: `asset`

Produces: `sensitivity_score` artifact for `asset`

Used by: `folder_ingest_v1`, `library_sensitive_scan_v1`

What it does: writes a sensitivity score onto the asset row.

How to use it: run before AI metadata if you want a safety gate.

Reads from DB: `assets.id`

Writes to DB: `assets.sensitivity_score`

Persisted data: currently writes a fixed placeholder score of `5`

Settings: none

Events emitted: `AssetUpdated`

Events consumed: none directly

Useful notes:

- This is currently a stub, not a real classifier
- `runtime.generate_ai_metadata` uses this field as part of its unsafe-content
  gate

## `runtime.generate_ai_metadata`

Capability: `external_api`

Accepts: `asset`

Produces: `ai_metadata` artifact for `asset`

Used by: `folder_ingest_v1`, `library_ai_metadata_v1`,
`selected_subject_metadata_v1`

Parameters:

- `aiMode`: `mock`, `live`, `off`
- `imageStrategy`: `overview_only`, `overview_plus_tiles`

What it does: gates metadata generation by sensitivity state, generates mock or
live Gemini metadata, persists machine metadata evidence blocks plus a resolved
projection, and tracks deferred pro-upgrade work when live runs fall back to
flash.

How to use it: use for caption, tag, and note generation. Feed it `asset`
subjects directly, or expand a `selection` first when the workflow starts from
UI selection state.

Reads from DB: `assets.id`, `assets.original_path`,
`assets.sensitivity_score`, `asset_identities.guid`,
`asset_identities.original_path`, `assets_manual.identity_guid`,
`assets_manual.sensitivity_status`, `settings.id`, `settings.value`

Writes to DB: `derived_results.id`, `derived_results.asset_id`,
`derived_results.task`, `derived_results.provider`,
`derived_results.model_version`, `derived_results.data`,
`photo_metadata_blocks.id`, `photo_metadata_blocks.asset_id`,
`photo_metadata_blocks.source_kind`, `photo_metadata_blocks.provider`,
`photo_metadata_blocks.model_version`, `photo_metadata_blocks.schema_version`,
`photo_metadata_blocks.data`, `photo_metadata_projection.asset_id`, and the
resolved projection source columns in `photo_metadata_projection`

Persisted data:

- compatibility result still uses `derived_results.task = 'ai_metadata'`
- mock mode uses provider `runtime_stub`
- live mode uses provider `google`
- live mode may also create `derived_results.task = 'ai_metadata_pro_pending'`
- machine evidence is stored in `photo_metadata_blocks`
- field-resolved best-current-view values are stored in
  `photo_metadata_projection`
- live payloads may include runtime flags such as `_analysis_tier` and
  `_pending_pro`

Settings:

- `ai_metadata_v2_api_key`
- `gemini_api_key`
- `job_ai_model`
- environment fallback `GEMINI_API_KEY`

Events emitted:

- `AssetUpdated`
- `AiMetadataConfigurationError`
- `AiMetadataV2UpgradeQueued`
- `QuotaWarning`

Events consumed: none directly

Useful notes:

- `aiMode = 'off'` makes the module a no-op
- Unsafe assets are skipped using manual safety overrides and the sensitivity
  score gate
- Flash scout and Pro refined runs now coexist as separate metadata evidence
  blocks; they are not collapsed into one stored machine answer
- Manual user edits are stored separately as sparse assertions and resolved
  locally with the machine evidence
- Query paths and the single-photo UI should prefer the resolved
  `photo_metadata_projection` view and only fetch deeper evidence on demand
- `selected_subject_metadata_v1` is the best current targeted metadata workflow

## Settings Cross-Reference

- `job_cluster_threshold` is used by `runtime.resolve_people`
- `ai_metadata_v2_api_key` is used by `runtime.generate_ai_metadata`
- `gemini_api_key` is fallback input for `runtime.generate_ai_metadata`
- `job_ai_model` is used by `runtime.generate_ai_metadata`
- `workflow_auto_scan` affects startup workflow behavior in core bootstrap
- `system_log_level` affects startup logging behavior in core bootstrap

## Event Cross-Reference

- `AssetUpdated` is emitted by `runtime.extract_embedded_metadata`,
  `runtime.detect_sensitive_content`, and `runtime.generate_ai_metadata`
- `WorkflowPreviewGenerated` is emitted by `runtime.generate_previews`
- `PreviewGenerated` and `PreviewFailed` are emitted indirectly by
  `legacy.preview.generate`
- `FacesDetected` is emitted by `runtime.detect_faces`
- `FaceEmbeddingGenerated` is emitted by `runtime.generate_face_vectors`
- `FaceClusteringUpdated` is emitted by `runtime.resolve_people`
- `AiMetadataConfigurationError`, `AiMetadataV2UpgradeQueued`, and
  `QuotaWarning` are emitted by `runtime.generate_ai_metadata`
- `JobStarted`, `JobProgress`, and `JobCompleted` are emitted indirectly by
  `legacy.preview.generate`

## Designer Guidance

- Prefer workflow-native modules over legacy adapters
- Use batch mode intentionally for `runtime.resolve_people` and
  `runtime.group_similar_photos`
- Treat `derived_results` as the main artifact store for many modules
- Treat photo metadata as an exception: use the photo metadata evidence tables
  plus the resolved projection, with `derived_results.ai_metadata` kept only as
  a compatibility artifact
- Expect partial success behavior from metadata and face-analysis modules
- Treat safety detection as a gate before AI metadata
- Remember that `selection` is synthetic handoff state, not durable domain data
