# TO DO List

## 2026-07-25 - Plug-in compatibility layers

- Registration adapters are removed and generated registries are checked by the
  quality gate. Complete the remaining implementation/UI isolation work before
  treating the architecture policy as exhaustive.

## 2026-07-21 - Adopt TypeScript 6 API tooling and triage newly exposed typed-lint findings

- A controlled clean-install comparison proved that switching the `typescript`
  package used by `typescript-eslint` from 5.9.3 to TypeScript 6 produces 142
  new typed-lint errors across unchanged source. Adopt the TypeScript 6 API only
  in a dedicated task that deliberately triages those findings and preserves a
  passing complete gate.

## 2026-07-19 - Reference-photo red-eye assist

- The red-eye tool uses only the current photo and persisted human face regions. Add an opt-in reference-photo workflow only after landmark-alignment and confidence checks can ensure that pose, lighting, and identity match before sampling a neutral iris colour.

## Photo editor

1. Move high-resolution rendering into a tracked, cancellable workflow and use disk-backed intermediate stages for very high-megapixel photos.
2. Ship and validate a promptable local segmentation model for pixel-accurate subject, background, and picked-element masks; the current editor uses detected normalized face/subject/region boxes when available.
3. Clarify and add the third requested non-AI editing tool; the original request left list item 3 blank.

## Gallery

1. [x] Hover on photo
   1. If the hover is in the top right corner display, technical details of the photo, including the original file name.
   2. Anywhere else, if the photo has a caption, display that (caption is stored in the database).
2. Move over any photo will get it to move slightly (same effect used in People view)

## People

1. Manual Clustering - Allow users to manually merge clusters of faces/people. Like all manual operations, this should be done in a way that is easy to undo. The data should be stored seperately from automatically clustered data.
2. It should also be possible to remove one/more faces from automatically generated clusters.
3. Introduce extra intelligence using family history and biographical data:
   1. Start with family tree support by allowing users to upload `.ged` family history files.
   2. Parse imported tree data so it can help identify likely people, relationships, and family groupings across photos.
   3. Design for richer person profiles over time, including biographical information such as jobs, military or other uniformed service, pets, and close friends.

## General UI

1. Add a Settings page. This will allow users to configure the application (i.e. settings stored in the DB) and their local app (i.e. settings stored in the app state, pesisted to local storage). Although currently both front end and core are on the same machine, this will allow for future expansion to a distributed system.

## Dashboard

1. [x] Persist the state of the 'pause all' button.

## Jobs

### Sensitive Content Detection [Not done - module exists, but it doesn't actually call any detection services]

Create a new job to detect potentially sensitive content in images (specifically nudity and sexual content). This must only run on the local machine - no cloud services should be used. This can use local AI models and/or local libraries. The output should be a %age likelyhood of the image containing sensitive content. This should be stored in the database.
The sensitivity score should then be used to  drive the following:

- Low sensitivity (0-25%): photo is flagged as safe for cloud services
- Medium sensitivity (25-75%): photo is flagged as requires manual review.
- Very high sensitivity (75-100%): photo is as unsafe for cloud services
Photos flagged as unsafe or requiring review should never be sent to cloud services. Introduce a manual process for reviewing photos flagged for manual review - as per our general approach, manually entered data should be stored seperately from automatically generated data (so automatic db tables can be blown away with manual data preserved). This should be done in a way that is easy to undo. The gallerly view and single view should have the facility to mark/unmark photos as safe/unsafe/requires manual review.

### Metadata Extraction (AI) [x]

Create a new job to get metadata for an image get_metadata_ai. This will use an AI prompt to determine:

1. Type of image: Landscape, Large group portrait, family portrait, document, newspaper clipping, drawing, painting, selfie, gravestone.
2. Estimated date, or date range, when the photo was taken. As accurate as possible: Decade, Year, Date, Full Date and Time. The estimate should consider:
   - content of the photo (e.g. clothing, hairstyles, technology, etc.)
   - physical artifacts (e.g. borders (e.g., Ornate, White, None), paper texture, medium)
   - chromatic analysis (e.g. sepia, color casts (e.g., Magenta shift), process ID)
   - filename (e.g. 'Robin 1960s.jpg')
   - EXIF data.
3. Estimated location of the photo (supply default)
4. Identify all people and pets in the photo. Use both the photo content. For each subject found:
   1. Lable - e.g. "Subject1", "Subject2", etc. This is the label that will be used to identify the subject in the photo when generating captions and other metadata. This should be unique for each subject in the photo. If subjects are manually identified or corrected later, this allows the caption to be updated without regenerating the entire caption.
   2. Bounding box (x, y, width, height) in pixels from bottom left corner
   3. Pet or person
   4. Location of the subject in the photo (e.g. 2nd from left, 3rd from right, center)
   5. Gender (male, female, other).
   6. For pets: dog, cat, bird etc.
   7. Estimated age range (e.g. 0-5, 5-10, 10-15, etc).
   8. Estimated date of birth range (based on age range and photo date range).
   9. Emotion (e.g. happy, sad, angry, surprised, etc).
   10. Eye gaze direction (e.g. looking at camera, looking left, looking right, etc).
   11. distinguishing features (e.g. glasses, beard, etc).
   12. List of suggested name + year of birth (based on csv file containing names and dates of birth, if supplied).
   13. If wearing a uniform, identify the uniform and the organisation it belongs to. (e.g. school uniform, Norwich City FC strip c.1970s, British Army WW2 Bomb disposal, etc.)
5. A caption for the image using (e.g. "Subject1 and Subject2 eating icecream on the beach at Great Yarmouth, 1960s", "Subject1 and Subject2 at Subject3's 5th birthday party, 1960s", etc.)
6. A list of keywords describing the image that could be used as tags for filtering.
7. Overall Emotional impact of the photo (e.g. fun, happy, sad, poignant, excitement).
8. Image quality score (percentage) - separate categories plus a discard flag:
   1. Technical quality (sharpness, focus, noise, etc.)
   2. Lighting quality (exposure, contrast, colour balance, etc.)
   3. Composition quality (framing, rule of thirds, leading lines, etc.)
   4. Emotional energy (lively, calm, etc).
   5. Discard (yes/no) - yes if photo is unuseable (e.g. blank, thumb over lens, etc).
9. Recommended specific enhancements (e.g. 'remove red colour cast', 'unblur child's face', 'Recover lost shadow detail in the dark coat of Subject2' etc). These will be used in addition to the general enhancements in the enhance job.
10. digital authenticity - Analyse the likelihood of the image being AI generated or manipulated, or digitally altered (e.g. Photoshop, etc.). Return a score (percentage) and a list of reasons.

Notes:

- This job should skip images flagged as sensitive. (see sensitive content for details)
- Should use both the photo content and metadata (filename and EXIF data).
- Machine metadata should be stored as evidence blocks (for example Flash scout
  and Pro refined), manual edits should be sparse user assertions, and the app
  should resolve a best-current-view locally instead of assuming one latest AI
  blob wins.
- Add a setting to allow users to set a gemini api key for the AI model. This should be stored in the DB.
- The implementation should create a gemini 3.1 pro prompt to request the metadata in a structured format (JSON).
- Add a setting to allow users to upload a csv file containing names, dates of birth, date of death and gender. This file will be supplied along with the photo to the AI model to help it identify people. This file can be generated from a .ged family history tree file using the Kinship explorer utility. The utility allows the selection of a 'focus' person and organises the list in order of closeness to the focus person.
- Need to consider how to join up between faces/people identified in this job and the faces/people identified in the face detection, recognition and clustering jobs. This is important for ensuring that the same person is identified as the same person across multiple photos.

### Similarity Detection

The goal of this job is to identify photos that are similar to each other. This can be used to identify duplicate photos, or photos that are very similar to each other. This should be done in a way that is efficient and can be run as a background job. It should use both the photo content and metadata (filename and EXIF data).

## Filters

1. Need an AI enhanced filter option - that would allow the user to type in conversational queries that the ai would translate into a DB query. Once we have the metadata enhancements working, we will have rich data about the photos and can ask sophisticated questions.

## Project structure

### Job modules

Make job modules pluggable. i.e. they can be distribted seperately to the main app and potentially written by thrid parties. They will need to be self describing and provide their own UI for configuration and display of results. They should be able to run as background jobs. In most cases they should be able to run in single and batch mode i.e. acting on one image or a batch of images. Need to establish a standard interface and standard events,error handling etc

Add ability to download job modules from the web, or local storage. Modules will be compressed, so should be decompressed into one or more files. It's optional to supply large local ai models with the module, so the module should be able to download them on first run if required. Ideally the module should allow users to choose ai models from a list, and the module handles any downloading.

Add a standard local AI model resource flow for modules that depend on large local models:

- Each module should expose settings for a model source URL and/or explicit local file override.
- Modules should supply a default model URL pinned to a known-good version.
- On first run, or when the configured source changes, the runtime should download the model into the app's local resource/model directory rather than the git repo.
- Model resolution should prefer an explicit local override, then the locally cached app resource, and never require checked-in `.onnx` files.
- The UI/settings layer should make it clear which model version is configured, whether it is downloaded, and allow a re-download or source change.
- Remove large local AI model files from the repo once this flow is in place.

Modules may define extra settings to be stored in the DB. These settings should be accessible via the UI - so the module should be able to define its own area on the settings page.

Add ability to view and edit workflows that determine how image(s) are processed. Jobs communicate with the controller via events and the controller can then trigger other jobs (by sending events). So a workflow maps the flow of events between modules. One way of thinking of the model is multiple modules connected to a single controller with the controller simply passing events between modules. But it's more useful to consider events as moving directly from one module to another.

Start by reviewing the existing jobs and events workflow. The configuration needs to be extracted from code and turned into configuration. Use a standard format for the configuration and genericise the existing code so we can setup different workflows. I think that we will need to make the events slightly more generic, but lets review what we have first. One area that seemed critical to making the processing work smoothly was prioritising and gating jobs - which ones have to finish before others can start, and which can run slowly in the background.

We will need a page in the UI to view and edit workflows. This will allow users to create and edit workflows.
I see workflows evolving in several directions:

1. Specific tasks like retrieving text from gravestones, or handwriting on documents, or identifying specific uniform types, or specific car models, etc. These could be triggered automatically by the detected media type or manually by the user.
2. The use case for family history research, is quite distinct to a general media library. Its likely we need different workflows for different use cases.
3. Oppertunity for other people to develop drop in replacement modules for specific tasks, that are more performant, or cheaper or more accurate than the standard modules. e.g. use a different ai or different prompts, or better trained models. This will allow the community to develop and share workflows, and for users to choose the best workflow for their needs. It also allows for experimentation and innovation.

### Specific Modules

#### Frame Detection

Detect frames around images.
Define a rectangle that is the maximum rectangle that sits fully within the frame (e.g. a photo 200x200px with a polaroid style frame 10px top, left and right and 50px bottom would be {10,10,180,140}. If the image has no border {0,0,200,200}).
Also identify the primary colour used in the border to allow blending into background.

## Workflow changes

1. Confirm/standardise the naming around workflows.
to equate to coding

- module = function definition;
- workflow = code calling modules with parameters (settings);
- workflow run = running the code.
That make sense??

1. As well as giving a setting an actual value of a specific type (number, text etc), there's the  option to pass in a parameter.
I would like to have an env file (excluded from github) that contains my google api key.
I would like a global setting
2. Add a per-asset finalize step for ingest workflows. This needs a design pass before implementation because it must support conditional branch completion:
   - non-sensitive assets should flow through AI metadata before finalization;
   - sensitive assets should skip AI metadata and finalize directly;
   - asset completion must work across multiple app sessions and background runs without requiring the whole folder to finish as one unit.
   See `docs/ingest-finalize-node-summary.md`.
3. Add true generic workflow resume support so failed runs can continue from recoverable checkpoints instead of relying on workflow-specific retry actions.

### Tooling Improvements

1. Move to Vite+ <https://voidzero.dev/posts/announcing-vite-plus-alpha>
2. Introduce
3. Move to ts7 when available
4. Tidy detached-workflow test cleanup noise in `test:core`.
   - Context: `npm.cmd run test:core` now passes `220/220`, but the run still prints a few noisy console errors from detached workflow tests while background tasks are finishing.
   - Current understanding: the failures no longer break the suite, but some tests still let detached runs outlive the test body long enough for `dbManager.close()` to race final status updates.
   - Likely focus areas: detached workflow command/telemetry/recovery-style tests that call `startDetached(...)`, then close temp DBs once their main assertion passes.
   - Goal: make the tests wait for full detached-run completion or otherwise shut down cleanly so `test:core` output is quiet as well as green.
5. Review parked branch `codex/improve-face-recognition-grouping` separately before merging.
   - Context: main cleanup on 2026-05-01 found this as the only non-merged branch besides the timeline branch.
   - Current state: it is explicitly labeled WIP and contains very broad artifact/tooling/source/test churn, so it was not treated as merge-ready.

UI Improvements

1. Sort by date - add ability to group by date, and to filter by date range, and to view photos in a timeline view.
2. Option for a date histogram view - showing number of photos in each year, and each month.
3. Add a lightweight, stable runtime smoke test for the gallery timeline decade controls.
   - Context: the timeline jump fix in `codex/fix-timeline-decade-jump` is covered by repo/UI tests and was manually verified with both an isolated Chrome/CDP probe and a later in-app browser decade sequence.
   - Goal: turn the `1940s` deep-jump and multi-decade click checks into a repeatable repo-owned smoke test that verifies the gallery pages forward and scrolls without issuing offset-0 refreshes.
4. Wire grouped timeline startup selection into the real date-mode state once the dedicated timeline slice lands.
   - Context: Task 2 added grouped timeline payload builders, command helpers, and initial-sync/message support, but the switch that decides when date mode should request `get_timeline_groups` is intentionally deferred to the later grouped-timeline state work.
5. Tighten grouped timeline payload normalization once the backend response shape is fully settled.
   - Context: Task 3 now consumes grouped timeline responses into a dedicated UI slice, but the transport layer currently accepts a small set of fallback payload keys (`timelineGroups` / `groupSummaries` / `groups`, `timelineGroupPage` / `page`, `timelineJumpTarget` / `jumpTarget`) because the backend handler shape is still in flux.
   - Goal: collapse this to one canonical payload contract after the grouped renderer path in Task 4/5 lands.

## 2026-04-26 - Grouped timeline smoke coverage

- Add a runtime-facing smoke test that exercises decade jump -> grouped page load -> visible-group highlight sync in date/justified mode, so regressions in `GroupedVirtuoso` range mapping are caught before release.

## 2026-04-30 - Timeline rail active decade still mis-syncs in grouped date view

- After moving the live work back into `codex/fix-timeline-decade-jump`, the runtime at `http://localhost:6093` still shows the solid rail highlight on `1890s`/`1900s` while the gallery viewport is visibly at `2010s`/`2000s`.
- Current mitigations already applied in the worktree: removed the flat-list fallback selection key in `libraryViewTimeline.tsx`, sorted visible tiles by on-screen position in `libraryVisibleSelectionKey.ts`, and seeded `getActiveTimelineSeek(...)` from `displayItems` instead of the raw `assets` array.
- Next debug target: inspect the grouped timeline state path (`timelineGallery.visibleGroupIndex` plus any backend ordering assumptions in the grouped timeline summaries) because the rail highlight is still being driven by a decade index that does not match the rendered grouped headers.

## 2026-04-30 - Resume-position persistence still needs a dedicated restore path

- The timeline reliability pass now fixes the wrong active decade mapping and the duplicate scroll reset on seek completion, but it does not yet persist the grouped gallery viewport across app restart/resume.
- If we want the library to reopen on the same photos, we need a persisted restore token for the visible timeline group or anchor asset instead of relying on transient in-memory scroll state.
- Grouped timeline backend handlers are still missing for `get_timeline_groups`, `get_timeline_group_page`, and `get_timeline_jump_target`; the live justified/date rail now uses loaded display items plus `GroupedVirtuoso` directly, but the backend command family still needs either implementation or removal.

## 2026-05-01 - Timeline grouped rail still not resolved

## 2026-05-02 - Feedback framework complexity follow-up

- The feedback-framework migration passes lint, typecheck, `test:repo`, and `test:ui`, but `npm.cmd run quality` still fails on `complexity:changed` thresholds for:
  - `src/ui/components/jobs/JobRow.tsx` (`JobRow`)
  - `src/ui/components/app/LoadedAppShell.tsx` (`LoadedAppShell`)
  - `src/boundary/runtime/workflowOverlayJobs.ts` (`scheduleWorkflowRunRefresh` / nested `poll`)
  - `src/ui/hooks/useJobManager.ts` (`applyLegacyProgress`)
- Follow-up: split these functions into smaller helpers so changed-function complexity returns to project limits (`cyclomatic<=10`, `cognitive<=20`).

- Removed the startup dependency on the missing grouped-timeline backend RPC family (`get_timeline_groups` in initial sync and refresh), so date/justified mode can boot from the full asset dataset without hanging on `Loading library data (WS)...`.
- Corrected the attempted `GroupedVirtuoso` jump API misuse (`scrollToIndex({ groupIndex })` was wrong for the documented grouped scroll example).
- The live `6093` app still shows the same decade-gap symptom after startup in browser verification, and browser automation click probes are not observing decade-bean movement even when the user reports some manual jumps work.
- Next isolation target: verify the actual section data being handed to the date/justified renderer, then trace the real click path from `LibraryTimelineRail` into `useDateTimelineJumpModel` in the live runtime.

- Timeline rail grouped-scroll handoff: click state now matches top header for direct decade jumps, but grouped justified scroll still shows decade-highlight lag around some boundaries (for example 1950s -> 1960s). The remaining suspect is visible-group state propagation during scroll, not the jump path itself.

## 2026-05-03 - Factory reset DB lock diagnostics hardening

- Factory reset can fail with `EBUSY ... library.db` when another core backend process is running from a different worktree/runtime but sharing `%APPDATA%/PhotoLibraryDesktop/library.db`.
- Follow-up: isolate per-runtime storage paths in dev sessions (or add single-instance lock enforcement) so parallel runtimes cannot contend for the same DB file.

## 2026-07-14 - Local masked-edit feedback

- Whole-photo slider edits now receive an immediate browser-side approximation before the exact low-resolution preview arrives. Masked edits intentionally skip that global approximation to avoid showing the effect outside its real scope.
- Follow-up: add a fast, localized mask overlay or per-mask canvas approximation so masked slider gestures receive equally immediate and spatially accurate feedback.

## 2026-07-15 - Worktree-aware repository tests

- The repository suite still has 2 path assertions that assume tests run from the primary workspace; update them to accept registered linked worktrees so `test:repo` can pass in thread worktrees.

## 2026-07-15 - Existing full-repository lint failure

- Split `ProfileTab` in `src/ui/components/single-photo/info-panel/ProfileTab.tsx`; the existing function is 92 lines against the 90-line Oxlint limit and prevents the full-repository fast-lint gate from passing even when staged photo-editor files are clean.

## 2026-07-15 - Rotation AI fill

- Rotation exposes an AI fill option alongside transparent, black, and white fills, but keeps it disabled until an inpainting workflow can generate pixels for the newly exposed canvas regions.

## 2026-07-15 - Existing accessibility audit backlog

- The project-wide accessibility checker reports 43 existing issues across 35 files. None point to the photo-editor files changed for the nested-frame cleanup; address the wider backlog separately.

## 2026-07-15 - Semantic segmentation candidates

- `runtime.detect_frame` currently asks FastSAM for one centre-point photo-content mask and persists that boundary as `frame_detection`; it does not yet request or label every semantic object in the photo.
- The editor now lists that real boundary together with persisted faces, AI subjects, and regions of interest. A future segmentation workflow should persist multiple labelled contours if pixel-accurate masks for arbitrary elements are required.

## 2026-07-16 - Photo editor component extraction

- The staged complexity report flags the editor preview dispatcher and crop, rotate, and colour-pop overlays, plus several editor workspace functions, above the project thresholds. Split these into smaller canvas, controls, and workspace-state components without changing the verified preview geometry.

## 2026-07-16 - Agent-neutral workflow rollout verification

- After the QA/task lifecycle tooling lands, run `ship this change` once from
  Codex and once from Antigravity on disposable test changes. Verify that both
  use the same gates and registry, allocate distinct runtimes/ports, and leave
  no branch, worktree, runtime, or stale task record after successful shipping.

## 2026-07-16 - TypeScript 7 backend migration

- Move the repository compiler to TypeScript 7 after `typescript-eslint`
  supports it and the CommonJS backend build no longer depends on the removed
  Node10 module resolver. Preserve CommonJS runtime output and make the core
  tsconfig acceptable to `typescript-go` before expanding type-aware Oxlint
  from the application project to the backend project.

## 2026-07-21 - Deterministic publication lifecycle implementation

- Implement the documented `published`, `merge-queued`, `merged`, and
  `cleanup-pending` task lifecycle commands. Replace the synchronous
  `thread:ship` compatibility behaviour with repository-owned remote
  observation and separate reconciliation; preserve protected merge gates.

## Photo editor architecture follow-up

- Audit and remove unused photo-editing compatibility infrastructure after all persisted recipes have completed their plug-in migration window.
