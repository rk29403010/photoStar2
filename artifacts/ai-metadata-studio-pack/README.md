# AI Metadata Studio Pack

This pack is a smaller, round-trip-safe subset of the AI metadata system intended for prompt tuning in Google AI Studio.

## Recommended edit targets

- src/services/aiMetadata/geminiPrompts.ts
- src/services/aiMetadata/geminiResponseSchema.ts
- src/services/aiMetadata/geminiResponseBoxes.ts
- src/services/aiMetadata/liveRuntime.ts

## Included files

- src/services/aiMetadata/geminiPrompts.ts
- src/services/aiMetadata/geminiResponseSchema.ts
- src/services/aiMetadata/geminiResponseBoxes.ts
- src/services/aiMetadata/geminiTypes.ts
- src/services/aiMetadata/liveRuntime.ts
- src/services/aiMetadata/liveRuntimeTagHelpers.ts
- src/services/aiMetadata/tagVocabularyEnforcement.ts
- src/services/aiMetadata/quotaManager.ts
- src/services/photoMetadata/coordinateNormalization.ts
- src/services/photoMetadata/types.ts
- src/services/photoMetadata/validation.ts
- src/services/workflowRuntime/modules/generateAiMetadataModule.ts
- src/boundary/contracts/core.ts
- src/shared/aiMetadata/analysisOptions.ts
- tooling/scripts/repo/ai-metadata-debug.mjs
- package.json
- tooling/config/tsconfig.core.json

## Existing single-photo runner

```bash
npm.cmd run ai-metadata:debug -- --asset=<asset-id-or-path-fragment> --imageStrategy=overview_only --metadataPass=scout --showPrompt=true --showSchema=true
```

## Suggested Repomix flow

Run Repomix against the `files/` directory in this pack, not the whole repo. That keeps the context small while preserving the real repo paths for reintegration.

Example:

```bash
cd artifacts/ai-metadata-studio-pack
repomix files
```

## Reintegration note

Keep edits aligned to the copied repo paths under `files/`. That makes it much easier to apply AI Studio changes back into the real repo without path drift.
