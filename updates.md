# Updates

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
