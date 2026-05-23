# PhotoStar2

PhotoStar2 separates logical code layers from deployment modes:

- logical source lives under `src/`
- deployment inputs live under `deployments/`
- build and repo tooling live under `tooling/`
- canonical architecture lives in `docs/architecture.md`

## Repo Layout

```text
src/
  ui/
  boundary/
  services/
  data/
  shared/
  entrypoints/
deployments/
  common/
  desktop/tauri/
tooling/
  config/
  scripts/
tests/
docs/
```

## Install

```bash
npm install
```

Optional model download:

```bash
npm run download:models
```

## Development

Browser or LAN runtime:

```bash
npm run dev
```

Web frontend only:

```bash
npm run dev:web
```

Core service only:

```bash
npm run dev:core
```

Desktop runtime without packaged sidecar rebuilds:

```bash
npm run dev:desktop-runtime
```

Fastest local edit loop with frontend debug logging and auto-restarting core:

```bash
npm run dev:fast-loop
```

Desktop shell:

```bash
npm run dev:desktop
```

## Build

Web bundle:

```bash
npm run build:web
```

Core compile:

```bash
npm run build:core
```

Desktop package:

```bash
npm run build:desktop
```

## Quality

Main quality gate:

```bash
npm run quality
```

Fast staged gate:

```bash
npm run quality:staged
```

Restart impact for changed files:

```bash
npm run dev:impact
```

## Notes

- `sidecar` is only the precise term for the packaged desktop companion process.
- Core build output is written to `dist/core/`.
- Web build output is written to `dist/web/`.
- Runtime-local and cache data should stay out of git.
- `src/ui/**` edits should usually hot reload without a manual restart.
- Changes under the core watch roots (`src/services`, `src/data`, `src/shared`, `src/boundary/contracts`, `src/boundary/transport`, `src/entrypoints/core`) should usually auto-restart the backend in `npm run dev:core` / `npm run dev:fast-loop`.
- Config, env, dependency, and Tauri host changes usually need a manual restart. Use `npm run dev:impact -- --staged` or `npm run dev:impact -- --files path1,path2` to confirm.
- Worktrees are most effective for independent tasks, not for splitting one vertical feature across UI and backend layers.
- The main workspace defaults to `5173/5174`. Worktrees under `.worktrees/<name>` or `worktrees/<name>` now get a stable automatic port offset, so parallel dev sessions do not fight by default.
- You can still force exact ports per workspace with `VITE_PORT` and `VITE_BACKEND_PORT`.

---
Current Version: 0.1.87
Run Timestamp: 2026-05-23T04:52:00Z
