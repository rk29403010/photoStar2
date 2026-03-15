# Workflow Module Authoring Guide v3

Last reviewed: 2026-03-14

## Status

This document is the target authoring contract for workflow modules built
outside PhotoStar and loaded by the workflow runtime.

- `docs/architecture.md` is the canonical architecture reference.
- This guide targets the `workflowRuntime` subsystem, not the older
  coordinator-managed module path.
- It is forward-looking for external runtime-loaded modules.
- The runtime contracts described here should drive new module design even where
  loader, installer, and trust mechanics are still being implemented.
- Current built-in modules remain statically registered in
  `src/entrypoints/core/main.ts`.
- Do not use the old coordinator `v2` event/queue model as the basis for new
  runtime-native module design.

Use this guide together with:

- `docs/architecture.md`
- `src/services/workflowRuntime/contracts.ts`
- `src/services/workflowRuntime/moduleRegistry.ts`
- `src/services/workflowRuntime/workflowRegistry.ts`
- `src/services/workflowRuntime/orchestrator.ts`
- `src/services/workflowRuntime/executionStore.ts`
- `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`
- built-in module examples under `src/services/workflowRuntime/modules/`

## Goal

An external AI or developer should be able to build one runtime-native workflow
module that:

- plugs into the workflow runtime instead of the coordinator queue/event path
- can be authored outside this repository
- exposes stable metadata, accepted subject types, and produced artifacts
- runs cleanly in isolation through a lightweight test harness
- can later be loaded by PhotoStar at runtime without changing the module's
  internal logic

## Scope

This guide covers:

- the runtime-native module model
- the target external package contract
- workflow and subject compatibility rules
- authoring constraints for external modules
- isolated test harness guidance for AI-assisted module development
- acceptance checks before a module should be integrated

This guide does not cover:

- the coordinator-era workflow module path
- remote marketplace or package distribution
- trust, signing, or sandbox enforcement details
- arbitrary plugin frontend bundles
- a visual workflow editor
- untrusted code execution policy

## Current Implementation Versus Target Contract

The workflow runtime already exists in the codebase.

Implemented today:

- `ModuleDefinition`, `WorkflowDefinition`, `RuntimeModuleContext`, and
  `RuntimeModuleRunResult` are real runtime contracts.
- workflow execution persists `workflow_runs`, `step_runs`, and
  `subject_executions`.
- built-in control nodes include `for_each`, `batch`, `collect`, and
  `approval_gate`.
- built-in modules such as `runtime.scan_folder`,
  `runtime.generate_previews`, and `runtime.generate_ai_metadata` run through
  the runtime today.

Not implemented yet:

- external package discovery and runtime loading
- persisted installed-module manifests
- package trust and signature policy
- a stable host SDK for external modules beyond the in-repo closure pattern
- module-specific frontend UI bundles

That split matters:

- The runtime execution model in this guide is real.
- The package and loader shape in this guide is the target boundary external
  authors should build toward.
- If current in-repo built-ins take shortcuts such as closing over `dbManager`
  directly, do not copy those shortcuts into external module designs.

## Core Runtime Model

### 1. Subject types

Workflows operate on typed subjects, not implicitly on queue rows.

A subject type defines:

- stable `id` and `version`
- whether the subject is durable
- summary fields for generic UI rendering
- progress semantics
- relations to other subject types
- generic UI detail sections and labels

Current examples in the runtime:

- `folder`
- `asset`

External modules should prefer existing subject types unless a new durable
subject type is genuinely required.

### 2. Modules

A runtime module is a typed execution unit. It does domain work only. It does
not control graph scheduling.

Current `ModuleDefinition` fields are:

```ts
interface ModuleDefinition {
  id: string;
  version: number;
  capability: CapabilityClass;
  accepts: string[];
  produces: ModuleOutputDefinition[];
  run: (
    context: RuntimeModuleContext
  ) => Promise<RuntimeModuleRunResult> | RuntimeModuleRunResult;
}
```

Current `RuntimeModuleContext` shape is:

```ts
interface RuntimeModuleContext {
  runId: string;
  subject: {
    subjectType: string;
    subjectId: string;
  };
  batchSubjects: Array<{
    subjectType: string;
    subjectId: string;
  }>;
  parameters: Record<string, unknown>;
}
```

Modules declare:

- stable module identity
- capability class such as `derive`, `group`, or `external_api`
- accepted subject types
- produced artifacts
- one `run(...)` function

### 3. Workflows

Workflows are DAGs composed from module nodes and built-in control nodes.

Current workflow node types:

- module node
- control node

Current control node types:

- `for_each`
- `batch`
- `collect`
- `approval_gate`

Important runtime truth:

- `workflow_runs` are the top-level execution record
- `step_runs` are per-node execution records
- `subject_executions` are the real per-item progress and outcome records

The primary design shift from the old model is that progress is no longer
inferred from queue mutations and job families. It is based on explicit runtime
execution rows.

## External Package Contract

This section is the target package contract for runtime-loaded modules. It is
intentionally narrow.

### Package layout

An external module package should contain:

- one manifest file
- one runtime entrypoint
- optional test harness files
- optional sample fixtures

Recommended layout:

```text
my-photostar-module/
  photostar.workflow-module.json
  package.json
  src/
    index.ts
    module.ts
    harness.ts
  fixtures/
    sample-photos/
```

### Manifest contract

Recommended manifest:

```json
{
  "schemaVersion": 1,
  "packageName": "example-photostar-caption-module",
  "displayName": "Example Caption Module",
  "entry": "./dist/index.js",
  "moduleIds": ["example.caption_generator"],
  "subjectTypes": [],
  "workflowIds": [],
  "minimumHost": "3.0.0",
  "description": "Generates caption-style metadata for asset subjects."
}
```

Guidelines:

- `moduleIds` must match the exported module definitions exactly.
- `subjectTypes` should usually be empty unless the package introduces a new
  subject type.
- `workflowIds` should be present only if the package exports complete workflow
  definitions in addition to modules.
- `minimumHost` is a compatibility declaration, not a lockfile substitute.

### Runtime entrypoint contract

The runtime entrypoint should export plain data and factories, not start work
on import.

Recommended entrypoint shape:

```ts
import type {
  ModuleDefinition,
  SubjectTypeDefinition,
  WorkflowDefinition,
} from 'photostar/workflow-runtime';

export interface PhotoStarModulePackage {
  subjectTypes?: SubjectTypeDefinition[];
  modules: ModuleDefinition[];
  workflows?: WorkflowDefinition[];
}

export const packageDefinition: PhotoStarModulePackage = {
  modules: [captionModule],
};
```

Authoring rules for the entrypoint:

- exports must be deterministic
- importing the package must not mutate files, network state, or the database
- registration should happen in the host, not inside the package module body

### Target host boundary for external modules

Current built-in runtime modules sometimes close over internal services such as
`dbManager` or `eventBus`. That is acceptable for in-repo modules but not for
external authoring.

External modules should be written as if the host will provide a narrow SDK for:

- reading subject inputs
- resolving files or binary assets for a subject
- writing artifacts or annotations
- logging and telemetry
- reading declared workflow parameters
- optional approved network access for `external_api` modules

External modules should not assume:

- direct SQL access
- direct mutation of internal PhotoStar tables
- access to arbitrary process environment variables
- knowledge of PhotoStar's internal file layout

## Authoring Rules

### 1. Keep IDs stable

After shipping, these identifiers must stay stable:

- module IDs
- subject type IDs
- workflow IDs
- artifact type names

Use a new ID when behavior changes materially enough that prior outputs should
not be treated as equivalent.

### 2. Prefer existing subject types

If a module processes assets, accept `asset` unless there is a strong reason to
 introduce a new subject type.

Only add a new subject type when:

- the entity needs its own lifecycle or progress semantics
- the entity should appear as a first-class workflow subject
- generic UI rendering can still describe it cleanly

### 3. Make isolated execution first-class

A module must be runnable outside a full workflow.

This is required because:

- module behavior often needs rapid tuning
- prompt-driven modules need comparison across many photos
- external AI-assisted iteration is much faster in a focused harness than in a
  full PhotoStar run

### 4. Be idempotent where practical

Running the same module twice for the same subject should be safe. Prefer one
of these patterns:

- overwrite the same derived artifact version deterministically
- produce the same output without duplication
- make duplicate writes easy for the host to deduplicate

### 5. Separate pure logic from host wiring

Put the core module logic in a pure or near-pure helper. Keep PhotoStar-specific
host access thin.

Recommended split:

- prompt building or scoring logic in a plain helper
- subject/file loading in a host adapter
- artifact mapping in a small result mapper

This makes harness work much simpler.

### 6. Declare side effects honestly

If a module calls an external model API, mutates library state, or writes
artifacts to disk, treat that as part of the module contract.

Do not design an `external_api` module that secretly:

- mutates unrelated records
- depends on ad hoc local cache state
- requires invisible manual setup to succeed

### 7. Support deterministic test mode

Prompt-heavy and model-heavy modules should support deterministic local testing
where feasible.

Recommended modes:

- `off`
- `mock`
- `live`

`mock` should return stable, reviewable outputs suitable for harness regression
tests.

### 8. Fail loudly but locally

A module should throw on subject-local fatal failures. It should not hide errors
behind silent null outputs.

When possible, return structured outputs for valid subjects and fail only the
subjects that truly failed. Avoid designs that require one broken input to make
every comparison run unusable.

### 9. Keep workflow concerns out of module internals

Modules should not encode orchestration patterns that belong in workflows.

Do not hide:

- looping
- batching policy
- approval decisions
- retry scheduling
- graph branching

Those belong in workflow definitions and control nodes.

## Minimal Module Skeleton

This is the minimal shape external authors should target.

```ts
import type {
  ModuleDefinition,
  RuntimeModuleContext,
  RuntimeModuleRunResult,
} from 'photostar/workflow-runtime';

interface CaptionResult {
  caption: string;
  tags: string[];
}

async function runCaptionLogic(context: RuntimeModuleContext): Promise<CaptionResult> {
  const promptStyle = context.parameters.promptStyle === 'detailed'
    ? 'detailed'
    : 'short';

  return {
    caption: `${promptStyle} caption for ${context.subject.subjectId}`,
    tags: ['example'],
  };
}

export const captionModule: ModuleDefinition = {
  id: 'example.caption_generator',
  version: 1,
  capability: 'external_api',
  accepts: ['asset'],
  produces: [
    { kind: 'artifact', artifactType: 'caption_metadata', subjectType: 'asset' },
  ],
  run: async (context): Promise<RuntimeModuleRunResult> => {
    const result = await runCaptionLogic(context);

    void result;

    return {
      outputs: [
        {
          kind: 'artifact',
          artifactType: 'caption_metadata',
          subjectType: 'asset',
        },
      ],
    };
  },
};
```

## Minimal Workflow Wiring Example

If a package also provides a workflow definition, keep the graph explicit.

```ts
import type { WorkflowDefinition } from 'photostar/workflow-runtime';

export const captionWorkflow: WorkflowDefinition = {
  id: 'example.asset_captioning',
  version: 1,
  inputs: ['asset'],
  parameters: [
    { id: 'promptStyle', valueType: 'enum', required: true, options: ['short', 'detailed'] },
  ],
  nodes: [
    {
      id: 'caption-assets',
      kind: 'module',
      moduleId: 'example.caption_generator',
    },
  ],
};
```

## Test Harness For External AI Module Development

The fastest way to build a good module is to iterate on it outside the full
workflow runtime.

### Harness goal

The harness should create an environment where the author can focus on the
module's core behavior, especially prompt and output tuning, across many photos
quickly.

The harness should:

- load a folder of sample photos
- create `RuntimeModuleContext`-shaped inputs for each sample
- run one module over many assets with the same parameters
- allow rapid parameter edits between runs
- display per-photo output, errors, and elapsed time
- save outputs to reviewable files such as JSON or Markdown
- support `off`, `mock`, and `live` modes when relevant
- avoid depending on the full PhotoStar workflow runtime unless necessary

The harness should not:

- clone the entire PhotoStar app
- recreate workflow orchestration
- implement plugin installation
- build a workflow editor
- require SQLite unless the module genuinely needs database-backed fixtures

### Recommended harness shape

Recommended local harness features:

- a small Node or browser-based runner
- one config file for sample folder and module parameters
- one compare view that shows outputs for multiple photos at once
- one output directory such as `runs/<timestamp>/`
- one optional fixture adapter that maps local image files into synthetic
  subject IDs

Recommended run artifacts:

- `summary.json`
- one output file per photo
- one error log for failed photos
- one copy of the parameters used for the run

### Prompt For Google AI Studio

Use the prompt below as a starting point when asking an external AI to build a
module-development harness.

```text
Build a local test harness for a PhotoStar workflow module.

Goal:
Create a small, fast environment for iterating on one module in isolation,
especially prompt tuning across many photos, without recreating the full
PhotoStar app or workflow engine.

Context:
- The target runtime model is a PhotoStar workflow runtime module.
- A module has an id, version, capability, accepted subject types, produced
  artifacts, and a run(context) function.
- The context shape is:
  {
    runId: string,
    subject: { subjectType: string, subjectId: string },
    batchSubjects: Array<{ subjectType: string, subjectId: string }>,
    parameters: Record<string, unknown>
  }
- The module will usually accept asset subjects.
- The harness is for local development, not production integration.

Build requirements:
- Use TypeScript.
- Keep the code small, readable, and modular.
- Load sample photos from a local folder.
- Create synthetic asset subject ids for each photo.
- Provide a way to edit module parameters in one place.
- Run the module against multiple photos in one command.
- Show per-photo status, elapsed time, and output summary in the console.
- Save full outputs to a timestamped run folder.
- Support mock, off, and live modes if the module uses model calls.
- Make it easy to compare outputs for multiple photos quickly.
- Keep the module logic separate from harness wiring.

Do not build:
- a full React application unless a tiny browser view is clearly justified
- a plugin marketplace
- a workflow editor
- PhotoStar database integration unless absolutely required
- any fake orchestration beyond repeatedly calling one module

Expected project structure:
- src/module.ts for the module logic or adapter
- src/harness.ts for the runner
- src/types.ts for shared runtime-like types
- fixtures/sample-photos/ for local test images
- runs/ for captured outputs

Expected harness behavior:
1. Read all photos from fixtures/sample-photos.
2. Build one RuntimeModuleContext-like input per photo.
3. Invoke the module for each photo.
4. Print a compact summary table.
5. Save structured outputs and errors to disk.
6. Make reruns fast and deterministic in mock mode.

Output format:
- First, explain the proposed file structure.
- Then generate the TypeScript files.
- Then show the command to run the harness.
- Then describe how to swap in a real module implementation later.
```

## Acceptance Checklist

A runtime-native module is ready for integration only if all of these are true.

### Authoring checks

- the module uses stable IDs and versions
- the module accepts the correct subject types
- the module's produced artifacts are explicitly declared
- the module can run outside a full workflow through a focused harness
- module import has no side effects
- deterministic `mock` behavior exists when the module is prompt-heavy or
  provider-heavy

### Runtime checks

- the module registers cleanly against the runtime contracts
- the module works in `per_subject` or `once_per_batch` execution as intended
- failures are surfaced clearly
- repeated runs do not create uncontrolled duplication
- workflow parameters are sufficient to reproduce a run

### Review checks

- changed Markdown passes `npm run lint:md`
- if code is added in-repo, changed files pass `npm run quality:staged`
- larger in-repo changes pass `npm run quality`

## Reject Conditions

Do not accept a module design if any of these are true:

- it assumes direct access to PhotoStar internals such as raw SQL tables
- it can only be tested through the full workflow app
- it hides orchestration policy inside `run(...)`
- it requires arbitrary secrets or local state without declaring them
- it has unstable IDs or output names
- it silently mutates unrelated state
- it cannot produce reviewable outputs in local development

## Guidance For Future Packaging Work

The next packaging layer should add:

- runtime discovery and install/uninstall flows
- compatibility validation against host runtime version
- a narrow host SDK for external modules
- trust, signature, and permission policy
- optional persisted installed-module manifests

That packaging work should not change the core authoring model in this guide.
The important boundary is:

- workflows orchestrate
- modules perform typed work
- external authors should be able to iterate in isolation first
- the host should later load those modules without requiring redesign
