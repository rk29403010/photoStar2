# Workflow Module Authoring Spec v1

Last reviewed: 2026-03-08

## Status

This document is normative for adding a new workflow-managed module to the
current codebase.

- It targets the code that exists today.
- It is for trusted, repo-local modules added by editing this repository.
- It is not a spec for downloadable third-party plugins yet.

Use this spec together with:

- `docs/workflow-jobs-current-state.md`
- `core/src/coordinator/workflows.ts`
- `core/src/coordinator/workflowModules.ts`
- `core/src/coordinator/index.ts`
- `core/src/events/types.ts`
- `core/src/main.ts`

## Goal

An external AI should be able to add one new module that:

- participates in the coordinator-managed workflow system
- runs as a background worker
- emits consistent events
- is visible in queue and job monitoring
- does not add more hard-coded orchestration drift

## Scope

This spec covers:

- event contract changes
- worker implementation
- workflow module registration
- queue integration
- monitoring integration
- optional settings and UI hooks

This spec does not cover:

- installable plugin packages
- sandboxing or untrusted code execution
- remote module downloads
- module-defined frontend bundles
- binary model download managers

Those belong to a later plugin-packaging spec.

## Current Constraints

The current subsystem already supports declarative workflow modules, but only
within a narrow built-in contract.

You must design within these limits:

- Workflow modules are defined in code as `WorkflowModuleDefinition`.
- Runtime registration exists, but persisted installed modules do not.
- The coordinator only knows a fixed set of dispatch event kinds.
- Transition conditions are also fixed in code.
- `jobs` and `task_queue` do not share a durable execution ID yet.
- Dashboard cards still infer module classes from job ID prefixes.
- Some manual commands still bypass the coordinator.

Because of that, a new module must be explicit about:

- its request event
- its result event
- its queue stage name
- its job ID prefix
- whether it is per-media or global

## Required Design Record

Before writing code, the implementing AI must fill in this record.

```yaml
module_id: example_pipeline
module_description: Short human description
stage_ids:
  - example_stage
request_event:
  type: ExampleRequested
  kind: media_batch # media_batch | signal
result_events:
  - ExampleCompleted
trigger_events:
  - MediaDiscovered
queue_mode: per_media_batch # per_media_batch | global_signal
gate: opportunistic # strict | opportunistic
active_counter: task_queue # task_queue | jobs_running
jobs_running_like: null
batch_limit: 100
use_heavy_batching: false
job_id_prefix: example-
issue_task_key: example_stage
storage_target:
  table: derived_results
  task_key: example_stage
manual_command_needed: false
dashboard_card_needed: true
settings_keys: []
```

Do not start implementation until every field has a concrete answer.

## Definition Of Done

A module is complete only if all of the following are true:

- the worker can be triggered by an event
- the coordinator can queue and dispatch its stage
- success moves queue rows to `completed`
- failure moves the batch to a visible terminal state
- batch jobs emit `JobStarted`, `JobProgress`, and a terminal event
- queue state is visible in `get_system_jobs`
- if a new dashboard card is required, it renders from stable job prefixes
- changed files pass the repo quality checks that apply to them

## Required Files

Most modules will touch these files.

Always required:

- `core/src/events/types.ts`
- `core/src/main.ts`
- one new worker file in `core/src/jobs/`
- `core/src/coordinator/workflowModules.ts`

Required when the workflow contract needs expansion:

- `core/src/coordinator/workflows.ts`
- `core/src/coordinator/index.ts`

Required when the module needs UI or dashboard visibility:

- `shared/types/jobs.ts`
- `src/types/events.ts`
- `src/hooks/useJobManager.ts`
- `core/src/handlers/systemJobsCommands.ts`

Required when the module adds user settings:

- `src/components/SettingsModal.tsx`
- database settings bootstrapping if a default is needed

## Authoring Rules

### 1. Prefer declarative queue progression

If the stage is per-media work, queue completion must happen through a
transition rule tied to a result event.

Do not add new imperative cleanup in the coordinator unless the current
framework cannot express the module safely.

If you must add imperative cleanup:

- document why the declarative model was insufficient
- keep the special case tightly scoped to the new stage
- note it in the module docstring

### 2. Reserve `JobFailed` for batch-level failure

New modules must not use `JobFailed` for per-asset warnings.

For per-asset problems:

- write a row to `processing_issues`
- include enough detail to find the asset and reason
- continue the batch where safe

Use `JobFailed` only when the whole job run failed.

### 3. Always include `pipelineStage`

The current event types make `pipelineStage` optional on `JobCompleted` and
`JobFailed`, but new modules must always include it.

This is required for:

- coordinator completion logic
- dashboard grouping
- future migration to first-class stage runs

### 4. Keep naming stable

Use stable snake_case or lower-case identifiers.

Required naming:

- module ID: `example_pipeline`
- queue stage: `example_stage`
- job ID prefix: `example-`
- issue task key: `example_stage`
- derived result task key: `example_stage`

Do not change these names after shipping without a migration plan.

### 5. Manual actions must not bypass the design

If a manual command is added, it should trigger the same event-driven path as
the background flow whenever possible.

Do not add a command that calls the worker directly if the stage is meant to be
workflow-managed.

## Event Contract

### Backend event definitions

Every new module must add event types to `core/src/events/types.ts`.

A normal per-media module usually needs:

- one request event
- one result event
- optional extra informational events

Example shape:

```ts
export type ExampleRequested = {
    type: 'ExampleRequested';
    mediaIds?: string[];
};

export type ExampleCompleted = {
    type: 'ExampleCompleted';
    mediaId: string;
};
```

Then add the new event types to the `DomainEvent` union.

### Frontend event definitions

If the frontend listens to the event stream, mirror the required event types in:

- `src/types/events.ts`

The frontend mirror does not have to expose every backend-only detail, but it
must stay compatible with the pushed event payload.

### Result event rules

A queue-driving result event must carry either:

- `mediaId`
- `assetId`

That is how `getQueueTransitionMediaId(...)` resolves ownership for transition
rules.

### Job lifecycle events

Every worker batch must emit:

1. `JobStarted`
2. zero or more `JobProgress`
3. exactly one terminal event:
   - `JobCompleted`
   - `JobFailed`

Required fields:

- `jobId`
- `pipelineStage`

Recommended fields:

- `totalItems` on `JobStarted`
- `processedItems`, `totalItems`, `currentItemPath`, `throughputIps`,
  `errorCount` on `JobProgress`

## Worker Contract

Create the worker in `core/src/jobs/<name>.ts`.

New workers should prefer an object parameter once the signature grows beyond a
few fields.

Recommended shape:

```ts
type RunExampleJobParams = {
    mediaIds: string[] | 'auto';
    dbManager: DatabaseManager;
    eventBus: EventBus;
    signal?: AbortSignal;
    jobId?: string;
    pipelineStage: 'example_stage';
};

export async function runExampleJob(
    params: RunExampleJobParams
): Promise<void> {
    // implementation
}
```

Worker requirements:

- be safe to re-run for the same asset where practical
- write outputs to stable tables
- emit job lifecycle events
- emit result events that can complete queue rows
- write per-asset issues to `processing_issues`
- honour `AbortSignal` if the worker can run long

The worker must own its own persistence logic.

The coordinator should decide when to run it.

## Workflow Module Contract

Add a `WorkflowModuleDefinition` in
`core/src/coordinator/workflowModules.ts`.

Each module contains:

- `id`
- `description`
- `enabledByDefault`
- `stagePolicies`
- `transitionRules`

### Stage policy rules

Use `activeCounter: 'task_queue'` when:

- the stage is one queue row per asset
- work is dispatched in batches of media IDs

Use `activeCounter: 'jobs_running'` when:

- the stage is a global signal stage
- a running job, not queue rows, is the source of truth

If `activeCounter` is `jobs_running`, you must supply `jobsRunningLike`.

### Dispatch rules

Current dispatch support is limited to the event types hard-coded in
`core/src/coordinator/workflows.ts` and emitted by the switch in
`core/src/coordinator/index.ts`.

If your module needs a new request event:

1. add the event type to `core/src/events/types.ts`
2. extend the allowed dispatch union in
   `core/src/coordinator/workflows.ts`
3. extend `emitDispatchEvent(...)` in
   `core/src/coordinator/index.ts`
4. subscribe to the request event in `core/src/main.ts`

Do not invent a module that depends on a request event the coordinator cannot
emit.

### Transition rule rules

Current action support is intentionally narrow:

- `queue_upsert`
- `queue_complete`

Current built-in conditions are also narrow:

- `always`
- `auto_preview_on`
- `auto_preview_off`
- `face_count_positive`

If the module needs a new condition:

1. add it to `QueueTransitionCondition`
2. implement it in `matchesTransitionCondition(...)`
3. keep it generic enough to be reused

Do not embed module-specific branching inside workers to avoid coordinator
changes.

## Monitoring Contract

### Queue visibility

If the module uses `task_queue`, it will appear in queue snapshots automatically
by stage name.

That is the minimum monitoring requirement.

### Job visibility

If the module emits normal `Job*` lifecycle events, it will appear in the
persisted `jobs` table.

However, dashboard summary cards still classify jobs by ID prefix in
`core/src/handlers/systemJobsCommands.ts`.

If the module needs its own summary card, update:

- job ID prefix classification
- active job stats queries
- failed job stats queries
- queue running-job counts
- card builder output

### Frontend transient job list

If the new `pipelineStage` should render with a friendly title, update:

- `shared/types/jobs.ts`
- `src/hooks/useJobManager.ts`

At minimum, the stage string must be valid and stable.

## Settings Contract

A module may add settings, but settings are not self-describing yet.

If the module needs user configuration:

- store settings in the existing settings table
- use explicit setting keys
- document each key in the module docstring
- add UI wiring manually if user editing is required

Do not assume the app can auto-render settings from a manifest.

## Implementation Algorithm

An external AI adding a new module must follow these steps in order.

1. Fill in the Required Design Record.
2. Add new backend event types and extend `DomainEvent`.
3. Add frontend event mirror types if the UI needs them.
4. Implement the worker in `core/src/jobs/`.
5. Wire the worker subscription in `core/src/main.ts`.
6. Add the workflow module definition in
   `core/src/coordinator/workflowModules.ts`.
7. Extend coordinator dispatch or conditions only if the existing contract
   cannot express the module.
8. Add optional manual commands, but keep them event-driven.
9. Add dashboard and UI mappings only where needed.
10. Run repo quality checks.
11. Verify the workflow end to end with real queue and event behavior.

## Acceptance Checklist

The implementing AI must verify all of the following.

### Static checks

- changed TypeScript passes `npm run quality:staged`
- larger changes pass `npm run quality`
- changed Markdown passes `npm run lint:md`

### Runtime checks

- a trigger event is emitted
- the module queues the expected stage rows
- the coordinator dispatches the request event
- the worker emits `JobStarted`
- the worker emits at least one result event
- the queue row or rows move to `completed` on success
- batch failure emits `JobFailed` with `pipelineStage`
- per-asset issues land in `processing_issues`
- `get_system_jobs` reflects the new work at least in queue data

### Reject conditions

The module is not acceptable if any of these are true:

- it only works through a direct command and not the workflow path
- it uses `JobFailed` for asset-level warnings
- it omits `pipelineStage` on terminal events
- it depends on job ID prefixes for orchestration correctness
- it finalizes all rows for a stage when only one dispatched batch finished
- it adds hidden coordinator special cases without documentation

## Minimal Example

This is the smallest valid shape for a per-media batch module.

```ts
{
    id: 'example_pipeline',
    description: 'Example analysis stage',
    enabledByDefault: true,
    stagePolicies: [
        {
            stage: 'example_stage',
            order: 70,
            gate: 'opportunistic',
            activeCounter: 'task_queue',
            batchLimit: 100,
            dispatch: {
                kind: 'media_batch',
                event: 'ExampleRequested'
            }
        }
    ],
    transitionRules: [
        {
            id: 'example-from-preview',
            eventType: 'PreviewGenerated',
            actions: [
                { kind: 'queue_upsert', stage: 'example_stage', priority: -30 }
            ],
            triggerEvaluate: true
        },
        {
            id: 'example-complete',
            eventType: 'ExampleCompleted',
            actions: [
                { kind: 'queue_complete', stage: 'example_stage' }
            ],
            triggerEvaluate: false
        }
    ]
}
```

This example is only valid after:

- `ExampleRequested` is added to the event union
- `ExampleCompleted` is added to the event union
- the coordinator knows how to dispatch `ExampleRequested`
- `core/src/main.ts` subscribes to `ExampleRequested`

## Guidance For Future v2

Do not expand this v1 spec into a packaging system.

The next spec should first introduce:

- first-class execution IDs
- queue ownership per dispatched batch
- normalized stage lifecycle events
- persisted module manifests
- self-describing settings schemas
- install and trust boundaries for external packages

Until then, this document is the contract for adding new modules safely to the
current subsystem.
