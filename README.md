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

## Notes

- `sidecar` is only the precise term for the packaged desktop companion process.
- Core build output is written to `dist/core/`.
- Web build output is written to `dist/web/`.
- Runtime-local and cache data should stay out of git.
