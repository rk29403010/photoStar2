## [0.1.72] - 2026-03-06T10:00:00Z

- **Fix: Job Controls & Dashboard UI** — Refined the system dashboard for better control and aesthetics.
  - **Functional Stop/Clear** — Updated backend `stop_job` and `clear_job_errors` to correctly handle virtual system job classes (e.g., stopping all active recognition jobs).
  - **Svelte UI** — Significantly reduced the size of action buttons in the Dashboard cards. Renamed to "Stop" and "Clear" for a cleaner, more professional look.
  - **Task Mapping** — Fixed error clearing by mapping frontend stages to correct backend database task names.
  - **Stability** — Added `stopPropagation` to dashboard actions to prevent accidental card selection.

## [0.1.71] - 2026-03-06T09:40:00Z

- **Fix: Lint Errors** — Resolved all reported code linting errors.
  - Removed unused `DomainEvent` import in `core/src/main.ts`.
  - Fixed `react-hooks/exhaustive-deps` and `react-hooks/preserve-manual-memoization` errors in `src/hooks/usePhotoLibrary.ts` by adding missing dependencies to the `actions` useMemo.
  - Updated `package.json` to ignore `src-tauri/target` in markdown linting and applied auto-fixes to documentation files.

## [0.1.70] - 2026-03-06T09:35:00Z

- **Feature: Advanced Job Management** — Implemented comprehensive controls for background system tasks.
  - **Stop Job** — Introduced a backend `stop_job` command with `AbortSignal` integration for grouping and hashing jobs. Stop buttons added to the System Dashboard and Background Tasks drawer.
  - **Clear Errors** — New `clear_job_errors` command removes processing issues from the database for a specific task class.
  - **Unified Progress** — The `build_groups` job now aggregates hash computation and similarity grouping into a single progress card with a shared parent ID.
  - **Task Drawer Close** — Added a **✕** close button to the Task Drawer header to allow manual dismissal of the task list.
  - **UI: AI Metadata De-duplication** — Added `ai_metadata` to the system dashboard stage list to prevent duplicate persistent/transient cards.
  - **UI: Fixed Dashboard Syntax** — Resolved syntax errors in `DashboardView.tsx` to ensure stable rendering of job controls.

## [0.1.69] - 2026-03-05T23:11:00Z

- **Feature: Interactive JSON Tree Viewer** — The Raw JSON tab now renders a fully interactive, colour-coded JSON tree instead of a flat pre block. Pure React, zero extra dependencies.
  - 🟦 **Object keys** — blue
  - 🟩 **Strings** — green
  - 🟨 **Numbers** — amber
  - 🩵 **Booleans** — cyan
  - 🟥 **Null** — red
  - Objects and arrays have a **▶ chevron** to expand/collapse inline. Clicking anywhere on the header row toggles.
  - **Top-level keys start expanded**; all children start collapsed for a clean overview.
  - **↵ Word Wrap toggle** — new icon button beside Copy JSON. When active, long string values wrap instead of extending horizontally. Button highlights indigo when enabled.

## [0.1.68] - 2026-03-05T23:00:00Z

- **Feature: Persist Info Panel State** — The Info Panel's open/closed state and active tab are now persisted to `localStorage` via `usePersistedState`. Navigating to gallery view and opening a different photo (or returning to the same one) will keep the panel visible and on the same tab as when you left. Keys: `ps_info_panel_open`, `ps_info_tab`.

## [0.1.67] - 2026-03-05T22:45:00Z

- **Feature: Bidirectional Face Hover Highlighting** — Hovering a person/subject card in the Info Panel's People tab highlights the corresponding bounding box on the image with a glow effect (and vice versa).
  - **Recognised Faces** cards (green) — hover highlights the matched face box (cyan/green glow).
  - **Detected Faces** list — all detected faces (named or unknown) now each have an individually hoverable row with a numbered badge.
  - **AI Subjects** cards (indigo) — hover highlights the AI `bounding_box` on the image with a purple dashed-border overlay.
  - **Image → Panel**: hovering a face box or AI subject box on the image also highlights the matching panel card.
- **Feature: AI Subject Bounding Boxes** — `FaceOverlayMap` now renders AI subject bounding boxes from `ai_metadata.subjects[].bounding_box` as dashed purple overlays (separate from face detection boxes). Supports both 0–1 and 0–1000 normalised coordinate systems.
- **Feature: Always-On Overlays for People Tab** — When the Info Panel's People tab is active, face and AI subject overlays are shown on the image even if the 👤 Faces button is off, giving instant spatial context.
- **Refactor: Controlled Tab State** — `activeInfoTab` is now lifted to `SinglePhotoView` so other components (e.g. `FaceOverlayMap`) can react to which tab is visible.

## [0.1.66] - 2026-03-05T21:50:00Z

- **UI: Zoom Bar — Info button** — Moved the "View Info" toggle out of the top bar into the bottom zoom bar as an icon-only `ℹ` button (indigo when active), matching the Faces button style.
- **UI: Zoom Bar — Faces button** — Stripped the "Faces" text label; button is now icon-only `👤` for a cleaner, more compact zoom bar.
- **UI: Zoom Bar padding** — Tightened zone `padding` from `8px 18px → 6px 14px` and gap from `12px → 8px`; nudged bar up from `bottom: 32 → 24`.

## [0.1.65] - 2026-03-05T18:33:00Z

- **Feature: View Info Panel** — Replaced the "View AI Metadata" modal and "Display All Info" option with a unified, modeless left-side info panel. Toggled by the **📋 View Info** button (or press **I**). Panel stays open while navigating images, showing data for the current photo.
- **UI: Info Panel Tabs** — Four tabs: **File** (filename, path, format, dimensions, AI caption, keywords, emotional impact), **Analysis** (quality scores as ★ stars, authenticity, sensitivity, enhancements), **People** (recognised faces, detected face count, AI subjects with pills for gender/age/emotion/location), **Raw** (sanitised JSON, no face embeddings, with copy button).
- **UI: Star Ratings** — Quality scores displayed as ★☆ stars out of 5 with exact % on hover tooltip.
- **UI: Two-column Layout** — When info panel is open, the photo fills the remaining right-hand space with aspect-ratio preserved. Panel slides in with animation.
- **Fix: Removed spurious 🔍 0% control** — The zoom bar sensitivity indicator was showing at 0% even for un-scored images. Removed from the zoom bar entirely (sensitivity is now shown in the Analysis tab of the Info Panel).
- **Fix: Removed old AI metadata modal and "Display all Info" modal** — Superseded by the new Info Panel.
- **Auto-open Info Panel** — Panel auto-opens when AI analysis completes on the current image.

## [0.1.64] - 2026-03-05T16:04:00Z

- **Feature: Proactive Quota Management** — New `quota_manager.ts` singleton tracks per-model Gemini rate limits (RPM window + daily quota) across all batch and single-asset calls in the same process.
- **Feature: Pro → Flash Fallback Chain** — `get_metadata_ai` now tries `gemini-3.1-pro-preview` first (best for person ID with CSV matching). On rate limit: waits ≤90s then retries pro once; if still limited falls to `gemini-3-flash-preview` with a simplified prompt. On flash rate limit: stops the batch gracefully. On daily quota: stops immediately.
- **Feature: Pro Re-analysis Queue** — Assets processed by flash due to pro rate limit are tagged as `ai_metadata_pro_pending` in `derived_results`. A future job run will pick them up and re-analyse with the pro model for enhanced person matching.
- **Feature: Two-tier Prompts** — Pro prompt uses multi-step reasoning and CSV name matching. Flash prompt is a lighter schema (no person CSV, fewer fields) matching model capabilities.
- **Feature: QuotaWarning + ProAnalysisPending Events** — New domain events emitted on fallback. Frontend displays dismissable golden/blue notification banners (top-right) explaining what happened and how many assets are queued.
- **Improvement: Shared Quota State** — Since quota is shared across batch and single-asset calls (same API key), the module-level singleton correctly prevents double-spending quota between concurrent or sequential invocations.

## [0.1.63] - 2026-03-05T12:49:00Z

- **Bugfix (Critical): AI Metadata Not Persisting** — The `auto` mode query in `runAiMetadataJob` was missing the `LEFT JOIN derived_results dr` clause, causing a SQL parse error (`dr.id IS NULL` with no `dr` alias). The query was silently returning all assets (or crashing), but the data write path was fine once it got to a row.
- **Bugfix (Critical): UI Not Refreshing After AI Metadata Save** — After the backend wrote AI metadata to `derived_results`, there was no mechanism to notify the frontend. Added a new `AssetUpdated` domain event (backend + frontend types). The backend `AssetUpdated` subscriber re-queries the full asset with all JOINs and pushes it as a typed event payload to all connected frontends.
- **Feature: Real-time Asset Refresh** — Frontend `usePhotoLibrary` now handles `AssetUpdated` events by merging the pushed asset into the local assets state. The updated image will show the 🧠 Info button immediately after analysis completes without requiring a page reload.
- **Improvement: Caption Promotion** — The `caption` field from AI metadata JSON is now promoted to the top-level `Asset` object in both `get_assets` and the `AssetUpdated` push, so it's available for gallery overlays and the "Show All Info" panel.

## [0.1.62] - 2026-03-05T10:20:00Z

- **Bugfix (UI): Error Modal Overflow** — Error modal now uses `maxHeight: 70vh` + `display:flex/column` so long error strings no longer escape the box. Content area scrolls, is selectable, and a 📋 Copy button copies the error to clipboard.
- **Improvement (UI): API error formatting** — Non-key errors are now shown in a styled `<pre>` block with `word-break` and `white-space: pre-wrap` for readability.
- **Feature (Backend): Configurable Gemini Model** — The AI model used for image analysis is now read from the `job_ai_model` DB setting (default: `gemini-2.0-flash`). Model name and key suffix logged on each job start.
- **Feature (Settings): Model Selection Dropdown** — Added a model selector dropdown in **Settings → Jobs → get_metadata_ai** with 4 options (2.0-flash, 2.5-flash, 3-flash-preview, 3.1-pro-preview) plus a direct API key link.

## [0.1.61] - 2026-03-05T09:49:00Z

- **Bugfix (Critical): `getSetting` in WebSocket Dev Mode** — The `getSetting` call was listening on `childProcess.stdout` which doesn't exist in WebSocket (browser) mode, causing a 5-second timeout and a false `MISSING_API_KEY` error even when the key was correctly stored. Fixed by routing through `wsRef` — a ref that tracks the active WebSocket — and using `addEventListener('message', ...)` pattern in WS mode.
- **Feature: Gemini API Key Format Validation** — Backend now validates the API key format (`AIza...`, ≥30 chars) before calling the API, logging the key suffix (`...XXXX`) in the error output for diagnosis.
- **Feature: Improved API Error Logging** — When a Gemini API call fails, the error log now includes the asset ID, last 4 digits of the key, and the full error message.
- **Bugfix (UI): Analysis Error Message** — Fixed incorrect "AI Studio" reference; updated link to `aistudio.google.com/apikey`; added `INVALID_API_KEY_FORMAT` error handling in the error modal; "Open Settings → API Key" button now opens the Settings modal (not ActionPanel).
- **Feature: In-App Dev Console** — Added a floating `DevConsole` component that intercepts all `console.log/warn/error/info` calls and displays them in a toggleable panel (bottom-right corner). Unread error/warn count shown on the badge. Eliminates the need to switch to Chrome DevTools for routine log inspection.

## [0.1.60] - 2026-03-05T09:21:00Z

- **Feature (Settings): Wired UI Settings** — `ps_theme` and `ps_animations` are now managed in `App.tsx` (single source of truth) and passed as props to `SettingsModal`. Toggling the theme applies `data-theme` attribute to `<html>`, and disabling animations applies `.no-animations` class (CSS disables all transitions globally).
- **Feature (Settings): Wired System Log Level** — The `system_log_level` DB setting is read on core sidecar startup. If set to `warn` or `error`, `console.log` (info-level) output is silenced globally, keeping the output stream clean.
- **Feature (Settings): Wired Auto-Scan on Startup** — If `workflow_auto_scan` is set to `last_folder`, the core sidecar automatically re-scans the most recently used folder 1.5 seconds after startup.
- **Feature (Settings): Wired Preview-on-Ingest** — The `workflow_generate_previews_on_ingest` setting is checked in the `Coordinator`. When set to `false`, newly discovered media skips the preview stage and proceeds directly to face detection.
- **Feature (Settings): Wired Cluster Threshold** — The `job_cluster_threshold` DB setting is read at runtime by `runFaceClusteringJob`, replacing the hardcoded `0.65` value. Defaults to `0.65` if not set.
- **Refactor (Core): `DatabaseManager.getSetting/setSetting`** — Extracted common settings read/write into typed helper methods on `DatabaseManager`. Callers in `handlers.ts`, `get_metadata_ai.ts`, `cluster_faces.ts`, and `coordinator/index.ts` now use these.

## [0.1.59] - 2026-03-05T07:35:00Z

- **Feature (UI): Dedicated Settings Window** — Moved application settings out of the Action menu into a dedicated `SettingsModal` accessible via a new 'cog' icon in the `TopBar`.
- **Refactor (Core): Settings Categories & Persistence** — Organized settings into System, UI, Workflows, and registered Job Types.
  - Connected UI settings (e.g., Theme, Animations) to local state.
  - Connected System & Job settings (e.g., Gemini API Key, Cluster Threshold) to the SQLite `settings` table via backend IPC, ensuring sensitive credentials are never stored in version-controlled files.
  - Migrated the existing Google API Key input to the AI Pipeline job settings tab.

## [0.1.58] - 2026-03-05T00:08:42Z

- **Build Pipeline Optimization**: Fixed a subtle race condition in the Fast Dev Loop (caused by concurrent execution of `tsc --watch` and `node --watch`) that resulted in Node immediately crash-restarting the `core/src/main.ts` server twice on launch. Pre-compiling `tsc` cleanly beforehand prevents node from capturing cascading file rewrites.

## [0.1.57] - 2026-03-04T23:44:24Z

- **Bugfix (Core): EADDRINUSE Orphan Port Auto-Kill** — Re-introduced an intelligent, targeted port-kill mechanism for `port 5174` in `main.ts` that specifically identifies the holding GUI/node process through `Get-NetTCPConnection` or `lsof` and violently kills it *only* if the PID doesn't match the current hot-reloading `process.pid`. This solves the issue where `node --watch` orphaned process trees and failed to recycle.
- **Bugfix (UI/Types):** Fixed ESLint errors (`@typescript-eslint/no-explicit-any` on `activeChild` object mapping inside `usePhotoLibrary.ts`) by correctly typing variables to Tauri's `Child` class from `@tauri-apps/plugin-shell`, and removing unused error exception payloads `catch(e)`.

## [0.1.56] - 2026-03-04T23:31:32Z

- **Bugfix (UI): Persistent "lost connection" visual error** — Resolved a persistent bug where the UI would correctly use local cached state but falsely display a permanent 'Lost connection to backend server' error in the header when the connection temporarily reset.
  - Added robust Auto-Reconnect logic in `usePhotoLibrary.ts` for both `WebSocket` dev proxies and Tauri `Child` sidecars.
  - Removed double-socket race conditions by properly utilizing the `useEffect` cleanup return to kill active WebSockets and reset `useRef` guards during Vite's React Fast Refresh loops.

## [1.0.6] - 2026-03-04T22:57:02Z

- **Fix (Core): EADDRINUSE Dev Loop** — Resolved the infinite process crashing during `node --watch` restarts by removing hostile manual port kills (`Stop-Process`), allowing graceful port recycling.
- **Refactor (Core): Procedural Routing** — Extracted the monolithic 700-line Websocket switch statement from `main.ts` into a cleanly separated `handlers.ts` module, drastically improving maintainability while preserving strict TypeScript safety.

## [1.0.5] - 2026-03-04T22:00:00Z

- **Fix (Core): TypeScript and Linting Errors** — Replaced `any` payloads with precise `unknown` and generic casts, added standard fallback values in `EventBus` payload deconstructions, and removed unused exception variables `_err` and `_e` across `main.ts` ensuring a fully strict `tsc` compilation.

## [0.1.55] - 2026-03-03T23:30:00Z

- **Fix (Core): AI Metadata Events** — Resolved an architectural drift where the backend was emitting `JobStarted`/`JobFailed`, but the frontend `useJobManager` and `SinglePhotoView` were expecting `TaskStarted`.
- **Fix (Core): Gemini Model Stability** — Swapped `gemini-exp-1206` for the stable `gemini-1.5-pro` model to resolve invalid API Key/Model Not Found errors on accounts that lack access to experimental nodes.
- **Improvement (UI): Detailed DB Info Panel** — Added a highly requested "Display all Info" action inside the `SinglePhotoView` Action Menu that opens a dedicated modal rendering the raw `Asset` object in a nicely formatted syntax container for immediate technical access.

## [0.1.54] - 2026-03-03T18:42:00Z

- **Improvement (UI): AI Metadata Extraction Hardening** — Upgraded the Analyze Image flow to gracefully handle API errors directly inside `SinglePhotoView`.
  - The UI now actively manages its own internal `analysisState` ('analyzing', 'cancelling', 'error').
  - The "Analyze Image" button transforms into a `🚫 Cancel Analysis` button during processing.
  - If the Gemini API Key is missing, the backend throws an explicit `MISSING_API_KEY` exception that the UI catches. This triggers a dedicated Error Modal overlaying the full-screen view containing direct links to Google AI Studio and an actionable button to open the settings panel.
  - Moved the Safe/Unsafe explicit tagging buttons out of the main zoom-toolbar and neatly grouped them under the Action Menu dropdown, visually styling them with `😃` and `🫣` emojis. The "Review" action was dropped per user request.

## [0.1.53] - 2026-03-03T12:35:00Z

- **Feature (UI): AI Analysis Status Indicator** — Added a visual indicator within `SinglePhotoView` when an AI metadata analysis is running.
  - When triggering "Analyze Image", a pulsing ✨ `Analyzing` badge appears immediately in the top right Controls header next to the Actions menu.
  - While tracking the `analyzingAssetId`, the component watches real-time state for incoming payload updates.
  - Upon successful backend delivery (`asset.ai_metadata` is populated), the component clears the analyzing flag and automatically opens the AI Info modal to present the results.

## [0.1.52] - 2026-03-03T12:25:00Z

- **Feature (UI): Single Photo Actions Menu** — Added a drop-down "Actions" menu to the top-right overlay of the SinglePhotoView.
  - Allows triggering the "✨ Analyze Image" AI Metadata job specifically for the currently viewed photo without returning to the main dashboard.
  - Automatically hides when the UI controls fade out or when clicking elsewhere.
  - Passes the new `onExtractAiMetadata` prop directly from `App.tsx` through to `SinglePhotoView.tsx`.

## [0.1.51] - 2026-03-03T11:28:00Z

- **Bugfix (UI): Fix "Invisible Locked Gallery"** — Resolved an issue where reloading the app with a selected photo cached in `localStorage` caused the `SinglePhotoView` to mount before the `assets` payload arrived. This cached an invalid `currentIndex = 0` internally, and combined with a missing `@keyframes fadeInOverlay` CSS definition, rendered an invisible fullscreen div over the gallery that permanently blocked all clicks.
  - Defended `App.tsx` by explicitly blocking `SinglePhotoView` from mounting until `assets` fully populates and actually contains the `selectedAssetId`.
  - Added the missing `fadeInOverlay` to `index.css`.
- **Bugfix (React): Passive Listener Exceptions** — Resolved `Unable to preventDefault inside passive event listener invocation` errors cascading down the console by swapping inline `onWheel` props on the `SinglePhotoView` with a native `useEffect` that explicitly binds with DOM `{ passive: false }`.

## [0.1.50] - 2026-03-03T08:06:00Z

- **Bugfix (Frontend): Fix TypeScript type errors in `usePhotoLibrary.ts`** —
  - Resolves `@typescript-eslint/no-explicit-any` on `addJob` by adding `ai_metadata` to the permitted `PipelineStage` union array in `types/jobs.ts`.
  - Fixes missing generic `stdout` typed properties when extracting setting outputs by securely casting the mocked Websocket Child sidecar (`childProcess`), preventing runtime destructuring exceptions in development WS mode.

## [1.0.4] - 2026-03-02T19:42:02Z

- **Bugfix (Core): WebP thumbnail incompatibility with `tf.node.decodeImage`** —
  Thumbnails are stored as WebP but TensorFlow's `decodeImage` only accepts
  BMP/JPEG/PNG/GIF, causing `"unsupported image type"` on every scan item.
  - `scan_sensitive.ts`: Added in-memory WebP → PNG conversion via `sharp` before
    calling `tf.node.decodeImage`. No temp files are written; the PNG buffer is
    GC-collected immediately after tensor creation.
  - Added lazy `_sharp` module ref alongside `_tf` / `_nsfwjs` for consistency.
  - End-to-end integration test (`scripts/test_webp_scan.js`) confirms full
    WebP → PNG → TF → nsfwjs → score pipeline works correctly.

## [1.0.3] - 2026-03-02T18:30:53Z

- **Bugfix (Core): `@tensorflow/tfjs-node` native binding on Node 22** — The pre-built
  `tfjs_binding.node` (NAPI v8) failed to load on Node 22 (NAPI v10) with
  `"The specified module could not be found"` because `tensorflow.dll` was only
  placed in `lib/napi-v10/` by the installer, not co-located with the v8 binding.
  - Added `scripts/fix_tfjs_binding.js` — copies `tensorflow.dll` into `lib/napi-v8/`
    so the NAPI-ABI-stable binding resolves its DLL on any Node version.
  - Registered as `postinstall` in `core/package.json` so future `npm install` runs
    apply the fix automatically.
  - Added both `tfjs_binding.node` and `tensorflow.dll` to `pkg.assets` for correct
    Tauri packaging.
  - Fixed stray `flush` function reference being passed as an arg to `console.log`
    in `scan_sensitive.ts`; removed the now-unused `flush` no-op helper.

## [0.1.49] - 2026-03-02

- **Feature: Manual De/Clustering improvements** — Full rejected-photo tracking and gallery visibility:
  - **DB**: Added `from_person_id` column to `manual_face_isolations` (with migration) so every face rejection remembers which person it came from.
  - **Backend**: `isolate_person_asset` now stores `from_person_id` in the isolation record.
  - **Backend**: `get_people` query now includes a `rejected_count` subquery per person.
  - **Backend**: New `get_rejected_assets_for_person` command returns assets previously removed from a given person.
  - **People View**: Photo count label now shows a red `-N` badge when a person has rejected photos. Full tooltip reads `N photos rejected` on hover.
  - **People Gallery (filter bar)**: New `🚫 Show Rejected` / `🚫 Hide Rejected` toggle button visible only when browsing a single person's gallery. Clicking it fetches and displays rejected photos.
  - **Library View**: Rejected assets appear in a clearly labeled greyed-out section (`opacity: 0.45`, `grayscale(40%)`) below the normal grid, with a divider reading "Rejected — N photos removed from this person".
  - Toggle and rejected assets state are properly cleaned up on Back, Clear All, and Refresh.

## [0.1.48] - 2026-03-02

- **Feature**: Added **"Force Re-scan All Images"** button to the Action Panel (AI Pipeline section).
  - Clears all existing `sensitivity_score` values across the entire library and kicks off a fresh scan of every asset.
  - Guarded by a confirmation dialog to prevent accidental long-running jobs.
  - Distinct orange 🔁 styling to differentiate from the incremental "Scan Sensitive Content" button.
  - Backend: `scan_sensitive_force` command + `force` flag on `runSensitiveScanJob`.

## [0.1.47] - 2026-03-02

- **Feature: Sensitive Content Detection** — Full end-to-end implementation of local AI-powered content safety scanning:
  - **Backend Job** (`scan_sensitive.ts`): Runs `nsfwjs` + `@tensorflow/tfjs-node` on-device. Scores each photo 0–100% for NSFW likelihood. Tier thresholds: Safe (0–24%), Review (25–74%), Unsafe (75–100%).
  - **Database**: Added `sensitivity_score` to `assets`, plus generic `asset_identities` (GUID ↔ path) and `assets_manual` (shadow table for manual overrides). Both shadow tables survive factory reset.
  - **Coordinator**: Sensitive scan is automatically queued as a low-priority background task after preview generation completes.
  - **API Commands**: `scan_sensitive`, `get_sensitivity`, `set_sensitivity` exposed via WebSocket/IPC.
  - **Dashboard**: New "Sensitive Content Scan" card in the System Dashboard showing progress and error count.
- **Gallery View** — Sensitivity badge on each tile:
  - ⚠ amber badge for `review` (25–74%) or manual-review override.
  - 🔞 red badge for `unsafe` (75–100%) or manual-unsafe override.
  - Instant hover quick-action buttons: `✓ Safe`, `⚠ Review`, `🔞 Unsafe` — toggleable/clearable.
- **Single Photo View** — Sensitivity controls in the bottom toolbar: AI score displayed, plus `✓ Safe`, `⚠ Review`, `🔞 Unsafe` toggle buttons.
- **Action Panel** — New "Scan Sensitive Content" button in the AI Pipeline section.
- **Types**: Extended `Asset` with `sensitivity_score?: number` and `sensitivity_status?: string | null`. Added `sensitive_scan` to `PipelineStage`.
- **Real-time updates**: Frontend state updates live as `SensitivityScored` events arrive from the backend.

## [0.1.46] - 2026-03-02

- **Feature**: Multi-Select in Library/Gallery View!
  - You can now long-press any photo in the library to enter multi-select mode.
  - Multi-select natively supports click-and-drag block selection! Simply drag across the grid to quickly highlight multiple contiguous items.
  - Selecting items opens a contextual action bar beside the current filter stack.
  - Use `Ctrl+A` or `Cmd+A` to instantly select all visible library items.
- **Decluster UX**: Renamed 'Untag' to 'Decluster'.
- **Decluster Visibility**: Declustered assets no longer vanish instantly until the next refresh. Instead, they visibly drop to the bottom of the current view and are greyed out, ensuring you don't lose your place in a large grid while scrubbing through false positives.

## [0.1.45] - 2026-03-02

- **Feature**: Manual Overrides! Provided interactive inline actions across the app to reorganize misidentified clusters:
  - **Single Photo View**: Click 'Not this Person' on a face bounding box to isolate the face into a new Unknown identity.
  - **Gallery View**: When filtering by a single person, hover over a photo to 'Untag Person' and instantly eject all faces of that person from that photo.
  - **People View**: Click any person's name to edit it inline, persisting immediately to the backend.
  - **People View**: Multi-select 2 or more people and press 'Merge' to combine them into a single identity with a new name.

## [0.1.44] - 2026-03-02

- **Bugfix**: Addressed filter `Back` logic so pressing back off the root of a query reliably drops you back into `People` view instead of sticking in the root Library.
- **Bugfix**: Corrected `get_people` total assets SQL, now specifically counting distinct `asset_id`s rather than multiplying out per-face instances.
- **Feature**: Track selected people count within App root and injected organically into Status Bar.

## [0.1.42] - 2026-03-01 14:00:00Z

- **Gallery Filters:** Added robust stackable filtering system for narrowing down photos by person ('any', 'all', 'only').
- **People View:** Added multi-select functionality via "long press" and integrated an action bar for applying compound filters.
- **Single Photo View:** Enabled clickable face bounding boxes that instantly apply a filter for that person and return the user to the filtered gallery.
- **Top Bar:** Automatically clears the active filter stack when switching core views to prevent confusion.

## [0.1.39] - 2026-03-01 10:45:00Z

- **Global Job Pause:** Added a "PAUSE ALL / RESUME ACTIVITY" toggle button to the main Dashboard.
- **Core State Interruption:** Implemented a new internal `SystemState` pausing loop across all heavyweight background tasks (`scan`, `previews`, `detect_faces`, `recognise_faces`, `cluster_faces`) allowing instantaneous zero-CPU state preservation.

## [0.1.38] - 2026-03-01 10:30:00Z

- **Linter Fix:** Removed unused `overlayStyle`, `rect`, and `ResizeObserver` variables from `Tile.tsx`.

## [0.1.37] - 2026-03-01 10:00:00Z

- **Job Orchestration:** Modified backend task coordinator to prioritize `previews` pipeline execution before handing off to ML analysis logic. Preview completion events now instantly bypass the 500ms debounce block, accelerating overall thumbnail generation rate without UI freezing.
- **Gallery Presentation:** Changed SQL query sort order from descending to ascending `ORDER BY a.created_at ASC`. Incoming media thumbnails now append sequentially at the end of the grid, ensuring stable scrolling and page layouts for the user during heavy ingest.
- **Gallery Stability:** `LayoutEngine` front-end components and backend event broadcasts strictly display images *only* when a valid `preview_path` extraction completes, preventing black placeholder flashes.
- **Auto-clustering:** Integrated a self-monitoring global trigger logic in the dispatcher loop. The global sweep "Face Clustering" Job now safely auto-executes upon completion of all active Recognition batches (without spamming identical clustering jobs).
- **Dashboard:** Relabeled "Face Analysis" card title to "Face Detection" for pipeline accuracy.

## [0.1.36] - 2026-02-28 20:10:00Z

- **People View (Crops):** Implemented automated "Face Cutout" generation. The clustering job now extracts a normalized, square 256x256 crop of the representative face for each person.
- **Normalization:** Added 1.5x padding around detected faces to provide better context (shoulders/hair) in the circular/square profile tiles.
- **Backend Query:** Updated `get_people` to use these high-quality crops while maintaining a whole-image fallback.

## [0.1.35] - 2026-02-28 15:35:00Z

- **Performance (REGRESSION FIX):** Hard-pinned the Gallery Gallery to **ONLY** use `preview_path` (thumbnails). Removed the implicit fallback to `original_path` which was causing massive performance degradation (loading 13MB originals in the grid).
- **Architecture Rule:** Added explicit warning in `Tile.tsx` to never restore the original fallback logic.
- **People View:** Updated the `get_people` backend query and frontend component to use thumbnails for cover photos instead of full-size originals.
- **Dev Fix:** Added the local image bridge fallback to the `PeopleView` for correct image rendering in browser development mode.

## [0.1.34] - 2026-02-28 15:05:00Z

- **Dashboard (Visuals):** Replaced React-side `Math.random()` with a **Pure CSS-based Equalizer** animation to resolve React purity errors and improve rendering performance.
- **Dashboard (Layout):** Compacted cards further to support 8-10 modules without scrolling on 1080p+ screens. Use full-page width for better readability.
- **Dashboard (Progress):** Stable Metrics implementation. Percentages are now calculated against a "Total Expected" figure, keeping metrics steady as the library grows.
- **Backend (Metrics):** Enhanced `get_system_jobs` to compute total expected items across all active and queued scans for better baseline metrics.
- **Bug Fixes:** Resolved React lint errors related to impure functions and type comparison mismatches.

## [0.1.32] - 2026-02-28 11:20:00Z

- **Dashboard (Aggregated):** Completely revamped the System Dashboard to use "Module Cards" focusing on functional classes. Aggregated all transient jobs into a single card per class (e.g., all Face Recognition jobs now appear in the "Face Mapping" card).
- **Dashboard (Metrics):** Upgraded Job Cards to a denser layout showing **Active Jobs**, **Throughput**, **Errors**, and **Average Speed** simultaneously.
- **Backend (Active Tracking):** The system now dynamically tracks the most recent file being processed within an entire module class and displays it in the aggregated "Working on" footer.
- **Types:** Added `idle` state to `JobState` to represent modules that have no active work but aren't necessarily "finished" (e.g., Onboarding).

## [0.1.31] - 2026-02-28 11:05:00Z

- **Performance (CRITICAL):** Fixed gallery slowness caused by redundant loading of 13MB+ original images instead of thumbnails.
- **Backend (Previews):** Simplified thumbnail generation logic (v3). Thumbnails now maintain original aspect ratios without artificial cropping or background padding.
- **Backend (DB):** Optimized `get_assets` SQL query to reliably fetch the latest thumbnail version using a subquery, preventing NULL fallbacks to original paths.
- **UI/Aesthetics:** Switched gallery tiles to `object-fit: contain` to ensure aspect ratios are kept perfectly correct without any scaling or cropping in the presentation layer.

## [0.1.30] - 2026-02-28 10:55:00Z

- **Stability:** Reworked "Factory Reset" confirmation message to be absolutely clear that original photo files on the disk are NEVER deleted.
- **Maintenance:** Confirmed that the "Factory Reset" correctly removes the library's `previews/` folder and all database entries.

## [0.1.29] - 2026-02-28 10:45:00Z

- **UI/UX:** Reworked the Action Panel into a 3-column grid layout for better space utilization, ensuring it fits vertically on most screens without scrolling the entire modal.
- **UI/UX:** Added a scrollable recent paths section within the Action Panel to handle long folder histories.
- **Aesthetics:** Enhanced the Action Panel with a premium backdrop blur, gradients, and section iconography.

## [0.1.28] - 2026-02-28 10:20:00Z

- **Sidecar:** Enhanced retry logic for thumbnail generation failures.
- **Documentation:** Updated the Semantic Brain with the latest data model specifications.

## [0.1.27] - 2026-02-28 10:15:00Z

- **Stability (UI/Backend):** Fixed a critical render loop in `usePhotoLibrary.ts` caused by unstable action function identities triggering frequent `DashboardView` re-renders and WebSocket ping/pong cascading.
- **Feedback:** Improved Background Job visibility. The System Dashboard now accurately reflects `running` states for automated modules (Previews, Face Detection, Recognition) by tracking active job IDs in the sidecar.
- **Resilience:** Enhanced `runScanJob` to detect and resume incomplete assets (e.g., those missing previews or face data) upon re-scanning, preventing "stuck" library states.
- **UX:** Added **Folder History** to the Ingest menu for quick re-selection.
- **Sanitization:** Scanner now automatically strips quotes from pasted folder paths.
- **UI:** Added a "Stop Scanning" button to the Action Panel to safely abort long-running ingest jobs.

## [0.1.26] - 2026-02-28 09:00:00Z

- **Bugfix (UI/Layout):** Fixed a grid distortion bug causing images to render horizontally stretched ("long, thin 19:6"). Updated the `LayoutEngine.tsx` grid column count from `12` to `24` to correctly geometry-pair with the halved `75px / 4.1vw` grid auto-row sizes (implemented back in `0.1.15`).
- **Aspect Alignment:** Brought frontend grid ratio bucketing into absolute mathematical parity with the backend thumbnail generator. `LayoutEngine.tsx` now natively calculates `W/H` (rather than inverted `H/W`) and natively generates target buckets for `3:2`, `2:3`, and `16:9` arrays to eliminate CSS stretching.

## [0.1.25] - 2026-02-28 08:50:00Z

- **Core Jobs:** Added a 2-second debounce to the `runFaceRecognitionJob` trigger in `main.ts` to prevent infinite event loop cascading during deep face detection ingest.
- **Core Jobs:** Added `TaskStarted`, `TaskProgress`, and `TaskCompleted` events to both `runFaceRecognitionJob` and `runFaceClusteringJob` so they correctly appear in the Dashboard's transient active-jobs view.
- **Resilience:** Errors inside `runFaceRecognitionJob` now properly skip the batch without crashing the job, logging correctly to terminal without hanging up UI updates.

## [0.1.24] - 2026-02-28 08:45:00Z

- **UI/UX:** Major revamp of the Background Jobs Dashboard layout to use premium dynamic Job Cards with Circular Progress indicators.
- **Layout:** Replaced standard fixed column grid with an `auto-fit` masonry-style flex grid that stretches cards to optimally cover available horizontal space across responsive breakpoints.

## [0.1.23] - 2026-02-28 08:15:00Z

- **Feature:** Added a thumbnail versioning system (`CURRENT_PREVIEW_VERSION`) to automatically invalidate and regenerate thumbnails when the algorithm changes.

## [0.1.22] - 2026-02-28 08:30:00Z

- **Feature:** Display highly persistent background system job states (such as bulk ingest, preview generation, and face detection sweeps) directly in the Dashboard as dynamic cards.
- **Bugfix:** Avoid face detection pipeline freezing by forcing serial fallback chunking rather than throwing 100+ parallel batch events at the Node event loop.
- **Backend:** `TaskStarted`, `TaskProgress`, and `TaskCompleted` events properly hooked up in `detect_faces.ts`. Added a new `get_system_jobs` action for Dashboard polling.

## [0.1.21] - 2026-02-28 07:23:00Z

- **Bugfix:** Resolved random backend disconnects by implementing a 30-second ping/pong heartbeat on the WebSocket server (`core/src/main.ts`) to prevent network timeout drops.
- **Reliability:** Added global `uncaughtException` and `unhandledRejection` catchers to the Sidecar to prevent silent crashes from unhandled promise errors.

## [0.1.20] - 2026-02-28

- Added Single Photo View with full-screen overlay, zoom controls, and panning.
- Added keyboard navigation to Single Photo View (Space to reset, Esc to close, Arrows to switch photo).

# Updates

## [0.1.19] - 2026-02-28 00:13:00Z

- **Bugfix:** Images were displaying with large black paddings or improperly positioned face overlays. This was due to two issues in the backend preview generation:
  1. `smartcrop-sharp` and `sharp` were manipulating JPEG dimensions without previously applying `EXIF` `.rotate()`, resulting in misidentified aspect ratios and wrong padding for portrait photos.
  2. Padded images were resized over a transparent background but lacked an alpha channel before composition (since they inherited JPEG), resulting in solid black bars. Fix forces `.webp()` extraction to preserve alpha.

## [0.1.18] - 2026-02-28 00:07:00Z

- **Feature:** Made the TaskDrawer (background jobs console) minimize by double-clicking its header bar.

## [0.1.17] - 2026-02-27 23:58:00Z

- **Feature:** Implemented intelligent target aspect ratio normalization for the backend Thumbnail generation (`previews.ts`).
- **Jobs/Image Processing:** Previews are now classified into the nearest standard aspect ratio (1:1, 4:3, 3:4, 3:2, 2:3, 16:9).
- **Cropping:** Added `smartcrop` logic. Images within a 15% tolerance of a standard ratio are cropped intelligently focusing on salient features (preventing cut-off heads).
- **Padding:** Images exceeding the 15% variance threshold are securely padded with a blurred, scaled-up background layer.

## [0.1.16] - 2026-02-27 23:15:00Z

- **Feature:** Added a comprehensive `"Dashboard"` view reachable from the `TopBar` for tracking Background Jobs in real-time.
- **Backend:** Upgraded `db.ts` schema to support job timestamps, processed/error counts, paths, and throughput metrics (`throughput_ips`).
- **Jobs:** Refactored Ingest (`scan.ts`) and Thumbnail (`previews.ts`) background jobs to emit throttled `TaskProgress` events with rich metric data.
- **Frontend:** Updated `useJobManager.ts` hook capabilities to consume new Job Manager events directly from the node sidecar.

## [0.1.15] - 2026-02-27 11:40:00Z

- **Performance:** Halved the base gallery grid CSS size from `150px` to `75px` to increase display density and significantly reduce on-the-fly rendering overhead.
- **Performance:** Changed backend thumbnail generation resolution from `256px` to exactly `450px`. This mathematically matches a `3x3` cell space (225px) on a standard 2x Retina/High-DPI display, eliminating GPU browser rescaling for the vast majority of photos.
- **Storage:** Switched generated backend previews from `.jpg` to `.webp` (effort: 4) to drastically reduce data transfer size to the frontend while maintaining visual fidelity.

## [0.1.14] - 2026-02-26 20:45:00Z

- **Feature:** Implemented smart aspect ratio bucketing in `LayoutEngine.tsx`. The grid now dynamically assigns both column and row spans to each photo based on its native aspect ratio (Panorama, Landscape, Square, Portrait, etc.).
- **Tweaked:** Updated the gallery grid to use a dense auto-flow packing algorithm and dynamic square base rows (`gridAutoRows: min(150px, 8.2vw)`), significantly reducing aggressive photo cropping while maintaining neat grid alignment.

## [0.1.13] - 2026-02-26 12:55:00Z

- **Fixed:** Gallery layout styling to remove grey margins around photos by setting `objectFit: 'cover'`. Also corrected the relative scale positioning logic for the facial recognition overlays due to this change.
- **Tweaked:** Reduced gap and padding spacing to 2px within the `LayoutEngine.tsx` grid algorithm, for a tighter look.
- **Fixed:** Added missing component prop types in `LayoutEngineProps` to pass TypeScript strict checking.
- **Modified:** Set `debug={false}` on the Layout component within `LibraryView.tsx` to clear development layout styling ("normal" tags).

## [0.1.12] - 2026-02-26 10:25:00Z

- **Fixed:** `Uncaught SyntaxError: Cannot use 'import.meta' outside a module` caused by the Vite error forwarder plugin injecting a non-module script tag.
- **Added:** Prominent UI error banner when sidecar/backend WebSocket connection fails, ensuring the user gets immediate feedback rather than silent console errors.
- **Fixed:** Native SQLite dependency crash caused by Node version mismatch (`npm rebuild`).
- **Added:** Basic HTTP file serving to the WebSocket Dev Bridge (`main.ts`) on port 5174 for the Chrome Dev loop.
- **Fixed:** `convertFileSrc` crash in `Tile.tsx` in a pure browser context by falling back to the new backend HTTP endpoint.
- **Fixed:** `dev` script in `core/package.json` for Windows compatibility.

## 0.1.11 - 2026-02-26

- Implemented standard Browser Dev environment ("True Fast Loop").
  - Modified node sidecar (`main.ts`) to also spawn a WebSocket server on port 5174 for Dev IPC.
  - Updated `usePhotoLibrary.ts` to detect `__TAURI_INTERNALS__` and gracefully fallback to WebSocket if running in standard Chrome.
  - Added fallback `prompt()` for folder picking in Chrome since native `webkitdirectory` cannot yield absolute OS paths.
  - Added custom Vite plugin to forward all `window.onerror`, `unhandledrejection`, and `console.error` logs back to the CLI terminal.
  - Cleaned up obsolete `usePipeline` hook usage in `App.tsx` causing lint errors.

## 0.1.10 - 2026-02-26

- Configured Vite (`vite.config.ts`) to automatically open the browser when running `npm run dev`.

## 0.1.9 - 2026-02-26

- Removed unused `useRef` import in `useJobManager.ts` to resolve ESLint error.

## 0.1.8 - 2026-02-25

- Fixed ESLint and TypeScript warnings and errors in `useJobManager.ts`, `usePhotoLibrary.ts`, and `core.ts`.
- Tweaked `vite.config.ts` to disable the blocking runtime error overlay.
- Updated the `build` script to explicitly run `npm run lint` beforehand so errors fail the build.

## 0.1.7 - 2026-01-24

- Fixed "Image Loading Failure" (Attempt 5).
  - Updated `tauri.conf.json` `assetProtocol` scope to use absolute path (`C:/Users/robin/AppData/...`).
  - `$APPDATA` variable is likely not supported in static `tauri.conf.json`.

## 0.1.6 - 2026-01-24

- Fixed "Image Loading Failure" (Attempt 4).
  - Enabled `app.security.assetProtocol` in `tauri.conf.json`.
  - Added scope `["$APPDATA/**"]` to `assetProtocol`.
  - This is the correct way to enable `asset:` protocol in Tauri v2, replacing the invalid capability approach.

## 0.1.5 - 2026-01-24

- Fixed "Image Loading Failure" (Attempt 3).
  - Reverted invalid `core:protocol` capabilities.
  - Relying on `fs:allow-read` for asset access, as `core:protocol` is not a valid namespace in this version.

## 0.1.4 - 2026-01-24

- Fixed "Image Loading Failure" (Attempt 2).
  - Added `core:protocol:allow-asset` and `core:protocol:allow-asset-scope` to capabilities.
  - This explicitly authorizes the asset protocol to serve files from `$APPDATA`.

## 0.1.3 - 2026-01-24

- Fixed "Image Loading Failure" (ERR_CONNECTION_REFUSED).
  - Updated `tauri.conf.json` CSP to allow `asset:` and `http://asset.localhost`.
  - Confirmed `convertFileSrc` generates correct `http://asset.localhost` URLs.

## 0.1.2 - 2026-01-24

- Fixed startup crash due to missing `fs` plugin.
  - Installed `@tauri-apps/plugin-fs` and `tauri-plugin-fs` crate.
  - Registered `tauri_plugin_fs` in `src-tauri/src/lib.rs`.

## 0.1.1 - 2026-01-24

- Fixed "broken images" by adding `fs:allow-read` for `$APPDATA/**` in sidecar capabilities.
- Fixed "single column grid" by refactoring `VirtuosoGrid` usage in `App.tsx` and implementing standard Flexbox grid styles in `App.css`.

## 0.1.0 - 2026-01-24

- Fixed Sidecar "exit code 1" startup failure.
  - Identified missing `sharp` native binaries in `pkg` assets.
  - Updated `core/package.json` to include `@img` and `sharp` assets.
  - Rebuilt and deployed sidecar binary.
- Added `debug_sidecar.bat` to root for direct sidecar debugging.
