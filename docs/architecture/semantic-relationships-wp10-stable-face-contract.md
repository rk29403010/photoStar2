# WP10 stable VisualRegion / Face contract and cutover inventory

Status: WP10a contract lock. This document records the pre-cutover identity contract and the concrete legacy dependency surface. It does not itself cut any consumer over.

Authoritative context: `semantic-relationships-architecture.md` section 11 and the WP10 work packages in `semantic-relationships-implementation-plan.md`.

## Stable identity contract

### VisualRegion ownership

- A `VisualRegion` owns the durable identity of a semantic region within an image.
- Its ID is independent of detector array ordering and must not be derived from `face_index`.
- A `Face` is the durable face entity tied to that `VisualRegion`.
- `face_index` may remain only as transient detector-run ordering while the WP10 compatibility bridge exists.
- A detector rerun must not mint a new stable ID merely because face order changes or geometry jitters.
- A removed detection is represented by lifecycle/reconciliation state rather than by silently reusing its stable ID for another face.

### Geometry generations

A VisualRegion has one durable ID and append-only geometry generations. Every persisted generation must retain:

- the source analysis generation;
- normalized geometry;
- source dimensions/orientation;
- detector/provider/version provenance;
- generation status.

Coordinate contract:

- normalized `[0,1]` coordinates;
- relative to the image after canonical EXIF orientation;
- original source pixel width and height retained with the generation;
- previous geometry evidence is never overwritten in place.

The existing `faceImageGeometry.ts` normalized post-orientation convention is therefore the compatibility baseline for WP10b.

### Reconciliation

WP10c owns deterministic one-to-one reconciliation. Stable identity is retained only for a plausible, unambiguous match. Reordering alone cannot change identity. Ambiguous matches fail safe rather than automatically reusing an ID. WP10d supplies permutation, jitter, add/remove, overlap and ambiguity regression coverage.

### Mask/editor ownership

`PhotoMaskMetadata` remains the canonical analysis-mask metadata surface. WP10b integrates stable VisualRegion references there rather than creating a second canonical mask store. Editor document mask snapshots remain immutable editor-version state and are not the durable VisualRegion geometry ledger.

## Reset, restore and rollback contract

### Soft library reset

Current transitional behaviour snapshots `manual_face_names` and `manual_face_isolations` by `original_path + face_index`, recreates the database, then restores those records. This preserves some user work today but is explicitly not the target identity model.

WP10f must replace that path/index restoration with durable VisualRegion/Face identity restoration and test it across soft reset, face-analysis reset and supported reimport/re-detection flows.

### Face-analysis reset

Target behaviour from the architecture:

- preserve stable Face/VisualRegion identity wherever reconciliation succeeds;
- preserve human Person records, testimony and decisions;
- rebuild detector geometry generations when requested, embeddings, machine candidates and clusters.

The current `reset_faces` implementation deletes assignments, People records and manual face name/isolation records. That is a transitional cutover target, not the target contract.

### Factory reset

Factory reset intentionally destroys the library database and rebuilds from schema. WP10 does not redefine that destructive user choice.

### Database migration and rollback boundary

Any WP10 schema addition must use the numbered migration ledger (`NUMBERED_MIGRATIONS` / `schema_migrations`), which is checksummed, transactional and append-only. Applied migration bodies are never edited.

WP10b is additive: legacy face tables and `face_index` remain available while stable persistence is introduced. Operational rollback during the additive/bridge stages therefore means reverting application code to the preceding compatible reader while leaving the already-applied additive schema intact. Destructive removal is deferred until WP10h proves no durable dependency remains.

## Legacy dependency and cutover inventory

| Current location | Current dependency / behaviour | Cutover target |
| --- | --- | --- |
| `src/data/dbSchema.ts` | `face_assignments`, `manual_face_names` and `manual_face_isolations` persist `face_index`; assignment/manual keys are index-based. | WP10b adds stable persistence additively; WP10e migrates durable writes; WP10h removes obsolete durable index storage only after proof. |
| `src/data/db.ts` | Soft reset snapshots and restores manual face work by `original_path + face_index`. | WP10f durable reset/reimport preservation. |
| `src/services/faces/peopleResolution.ts` | Reads prior assignments by `(asset_id, face_index)`, rewrites assignments with `face_index`, applies manual path/index overrides, and indexes detector output by `face_index` for thumbnails. | WP10b stable persistence, WP10c reconciliation, then WP10h contraction. |
| `src/services/handlers/peopleCommands.ts` | Rename/merge/isolate/confirm/reject durable actions read/write `face_index`; API payloads accept `assetId + faceIndex`. | WP10e durable People action cutover; WP10g payload/runtime cutover. |
| `src/entrypoints/core/main.ts` | `AssetUpdated` payload assembly reads assignment `face_index` and attaches People to the positional detector face array. | WP10g payload/runtime cutover. |
| `src/services/handlers/assetCommands.ts` | Asset list/detail SQL serializes `face_index` into `people_data` for the legacy face payload adapter. | WP10g payload cutover. |
| `src/services/handlers/assetPayloadModel.ts` | Attaches People to positional face arrays by `face_index`; mask labels also resolve positional `face-N` reference IDs back through `face_index`. | WP10b stable VisualRegion mask integration; WP10g payload cutover. |
| `src/services/handlers/relationshipGalleryAssetLoader.ts` | Relationship-gallery asset payloads serialize `face_index` into `people_data` before using the common asset payload adapter. | WP10g payload cutover. |
| `src/ui/components/PeopleView.tsx` | Face assignment response contains `face_index`; confirm/reject/unmatch send `assetId + faceIndex`. | WP10g People UI/payload cutover. |
| `src/services/handlers/systemCommands.ts` | `reset_faces` deletes face analysis, assignments, People and manual name/isolation state globally or per asset. This is a required cutover path even though it contains no literal `face_index`. | WP10f reset preservation. |
| `src/boundary/runtime/usePhotoLibrary.faceSystemActions.ts` | Reset/rerun commands invoke the transitional reset behaviour before re-detection. This is a required cutover path even though it contains no literal `face_index`. | WP10f preservation plus WP10g runtime-action cutover where stable identity must be passed/resolved. |
| `src/services/workflowRuntime/modules/plugins/detect-faces/implementation.ts` | Detection currently emits positional face identifiers such as `face-1`, `face-2`. | WP10b stable region/face population; WP10c reconciliation. |
| `src/services/workflowRuntime/modules/plugins/generate-face-vectors/implementation.ts` | Vector generation inherits current detector face identity/order. | WP10b stable persistence/provenance; later WP11 owns the full vector-generation lifecycle. |
| `src/services/workflowRuntime/modules/plugins/resolve-people/implementation.ts` | People resolution enters the legacy assignment path. | WP10c reconciliation support, WP10e durable action separation, later WP12 machine-cluster/Person lifecycle split. |
| `src/boundary/contracts/photoEditor.ts` and `src/services/photoEditing/assetMaskMetadata.ts` | `PhotoMaskMetadata` persists masks but currently has no stable VisualRegion serialization. | WP10b mask integration using the existing metadata store. |

## Automated repository guard

`tests/repo/wp10-face-index-inventory.test.mjs` scans all maintained source files for snake-case `face_index`. The baseline is statement-level rather than a filename allowlist: each reviewed trimmed statement and its maximum current multiplicity are frozen. A new path, a changed/new `face_index` statement, or an increase in an existing statement's multiplicity fails the repository test and requires explicit WP10 review. Removing legacy statements is allowed as the later cutovers land.

The source scan deliberately cannot discover reset/rerun dependencies that do not literally contain `face_index`; `systemCommands.ts` and `usePhotoLibrary.faceSystemActions.ts` are therefore explicit inventory entries above and remain mandatory WP10f/WP10g cutover targets.

Camel-case `faceIndex` command payload wiring is likewise documented as consumer wiring rather than database persistence; WP10g owns that consumer cutover.

## WP10a exit condition

WP10a is complete only when:

1. this contract/inventory is present in the repository;
2. the automated legacy-statement guard is green;
3. canonical quality-gate CI is green on the contract/guard commit;
4. no WP10b consumer cutover has been mixed into WP10a.
