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
