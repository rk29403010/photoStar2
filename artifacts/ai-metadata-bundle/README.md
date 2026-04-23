# AI Metadata Bundle

This bundle captures the current repo-side AI metadata module code plus the existing single-photo debug runner.

## Included entry points

- src/services/workflowRuntime/modules/generateAiMetadataModule.ts
- src/services/aiMetadata/liveRuntime.ts
- tooling/scripts/repo/ai-metadata-debug.mjs

## Included local source files

- 28 files copied under `files/`
- Full local dependency graph for the entry points above

## External npm packages used by the bundle

- @google/generative-ai @ ^0.24.1
- better-sqlite3 @ ^11.10.0
- exif-parser @ ^0.1.12
- sharp @ ^0.33.5
- uuid @ ^11.0.3

## Existing single-photo test rig

The repo already exposes the debug runner:

```bash
npm.cmd run ai-metadata:debug -- --asset=<asset-id-or-path-fragment> --imageStrategy=overview_only --metadataPass=scout --showPrompt=true --showSchema=true
```

The copied runner source is:

- `files/tooling/scripts/repo/ai-metadata-debug.mjs`

## Notes for Google AI Studio

- Local repo imports are copied here as source files.
- External npm packages are listed in `external-packages.json` and `external-packages.txt`, but not bundled.
- Node built-ins used by the copied files are listed in `node-builtins.txt`.
