# Workflow Module Authoring Spec v2

Last reviewed: 2026-03-10

## Status

This document is the target authoring contract for new workflow-managed modules.

- `docs/architecture.md` is the canonical architecture and workflow reference.
- It is still constrained by the current in-repo runtime, not by a future plugin system.
- It applies to trusted, repo-local modules added by editing this repository.
- It introduces replacement/retirement rules for built-in modules.

Use this spec together with:

- `docs/architecture.md`
- `core/src/coordinator/workflows.ts`
- `core/src/coordinator/workflowModules.ts`
- `core/src/coordinator/index.ts`
- `core/src/events/types.ts`
- `core/src/main.ts`

## Goal

An external AI should be able to add or replace one workflow-managed module that:

- participates in the coordinator-managed workflow system
- runs as a background worker
- uses stable, reviewable module metadata
- emits queue-driving result events instead of relying on stage-wide cleanup
- makes rate-limit behavior explicit when cloud APIs are involved
- can retire a previous built-in module without deleting it immediately

## Scope

This spec covers:

- event contract changes
- worker implementation
- workflow module registration
- queue ownership and dispatch identity
- monitoring integration
- replacement/retirement metadata
- optional settings and UI hooks

This spec does not cover:

- installable plugin packages
- untrusted code execution or sandboxing
- remote module downloads
- self-describing settings UIs
- frontend bundles shipped by modules

Those belong to a later packaging/plugin spec.

## Current Runtime Truth

The codebase now supports more than `v1`, but it still has hard limits.

Design within these limits:

- Workflow modules are still defined in code as `WorkflowModuleDefinition`.
- Runtime registration exists, but persisted installed modules do not.
- Dispatch event support is still explicit in coordinator code.
- Transition actions are still intentionally narrow.
- Queue rows can now be claimed by a dispatched job, but the queue is not a full execution-run model.
- Dashboard aggregation is still largely based on stable job ID families and stage names.
- Some older manual commands still bypass the workflow path.

Because of that, every new or replacement module must be explicit about:

- its request event
- its queue-driving completion event(s)
- its stage names
- its batch ownership mode
- its rate-limit strategy
- whether it replaces an existing built-in module

## Required Design Record

Before writing code, the implementing AI must fill in this record. This is the
architectural contract for the module.

```yaml
module_id: example_pipeline
module_description: Short human description
module_status: active # active | legacy
replaces_modules: []
replaced_by_module: null
stage_ids:
  - example_stage
request_event:
  type: ExampleRequested
  kind: media_batch # media_batch | signal
  worker_mode: default
result_events:
  - ExampleCompleted
trigger_events:
  - MediaDiscovered
gate: opportunistic # strict | opportunistic
active_counter: task_queue # task_queue | jobs_running
jobs_running_like: null
batch_limit: 100
use_heavy_batching: false
batch_ownership:
  mode: none # none | job_id
  job_id_prefix: null
rate_limit_strategy: none # backoff_and_pause | fail_fast | dynamic_tier | none
storage_compatibility: reuse_existing_results # reuse_existing_results | write_versioned_results | dual_write_transition
monitoring_compatibility: split_legacy_and_replacement # merge_legacy_and_replacement | split_legacy_and_replacement
job_id_prefixes: []
issue_task_key: example_stage
storage_target:
  table: derived_results
  task_key: example_stage
manual_command_needed: false
dashboard_card_needed: true
settings_keys: []
```

### Field Semantics

#### Lifecycle and replacement

- `module_status` identifies whether the module is the current implementation or a retained legacy implementation.
- `replaces_modules` lists module IDs intentionally superseded by this module.
- `replaced_by_module` is used on a legacy module to point at its successor.

#### Dispatch and ownership

- `request_event.worker_mode` is a runtime-visible worker hint for event types that support multiple modes.
- `batch_ownership.mode: job_id` means the coordinator claims queue rows with a generated job ID for the dispatched batch.
- `batch_ownership.job_id_prefix` must be stable and must match the worker's emitted `JobStarted` / `JobFailed` / `JobCompleted` family.

#### Rate limiting

- `rate_limit_strategy` is part worker contract and part monitoring contract.
- In `v2`, this field is authoritative for module design and monitoring expectations.
- It is only a coordinator behavior input when runtime code explicitly consumes it.

#### Compatibility

- `storage_compatibility` decides whether the replacement reuses the old canonical results, writes versioned results, or dual-writes during migration.
- `monitoring_compatibility` decides whether dashboard surfaces merge old and new module activity or temporarily show them separately.

## Definition Of Done

A `v2` module is complete only if all of the following are true:

- the worker is triggered by an event the coordinator can emit
- the coordinator can queue and dispatch the stage
- success advances queue rows through queue-driving result events
- batch failure affects only rows owned by that dispatched batch
- per-asset problems do not emit batch-fatal `JobFailed`
- batch jobs emit `JobStarted`, `JobProgress`, and exactly one terminal batch event
- queue state is visible in `get_system_jobs`
- rate-limit behavior is explicit and observable
- replacement/retirement behavior is documented if an older built-in module exists
- changed files pass the repo quality checks that apply to them

## Required Files

Most `v2` modules will touch these files.

Always required:

- `core/src/events/types.ts`
- `core/src/main.ts`
- one worker file in `core/src/jobs/`
- `core/src/coordinator/workflowModules.ts`

Required when the workflow contract needs expansion:

- `core/src/coordinator/workflows.ts`
- `core/src/coordinator/index.ts`
- `core/src/db.ts`

Required when the module needs UI or dashboard visibility:

- `shared/types/jobs.ts`
- `src/types/events.ts`
- `src/hooks/useJobManager.ts`
- `core/src/handlers/systemJobsCommands.ts`
- `core/src/handlers/systemDashboardModules.ts`

Required when the module adds settings:

- `src/components/SettingsModal.tsx`
- settings bootstrapping in the database

## Authoring Rules

### 1. Prefer declarative per-row completion

If a stage is per-media work, completion should happen by transition rule from a
result event carrying `mediaId` or `assetId`.

Do not copy the legacy AI metadata pattern of stage-wide finalization for all
`processing` rows. That pattern is retained only for legacy modules that have
not yet been migrated.

### 2. Use batch ownership when a batch can fail independently

If a batch-level fatal error should fail only the rows dispatched in that batch,
use `batch_ownership.mode: job_id` and stable job ID prefixes.

This is especially important for external API workers that process batches but
complete rows individually.

### 3. Reserve `JobFailed` for batch-level failure

New modules must not use `JobFailed` for per-asset warnings.

For per-asset problems:

- write a row to `processing_issues`
- emit queue-driving completion for the affected row when the item is being
  treated as terminal-with-warning
- only emit `JobFailed` when the whole dispatched batch failed

### 4. Always include `pipelineStage`

`pipelineStage` may still be optional in some older type definitions, but new
or replacement modules must always emit it on `JobCompleted` and `JobFailed`.

### 5. Keep naming stable

Required naming rules:

- module IDs stay stable after shipping
- stage names stay stable after shipping
- job ID prefixes stay stable after shipping
- replacement modules get new module IDs and new internal stage names

Do not silently reuse a retired module ID for a different implementation.

### 6. Manual actions must use the workflow path

If a manual command exists, it should enqueue workflow work or emit the same
request event path the coordinator uses.

Do not add a direct worker call for a module that is meant to be
workflow-managed.

## Event Contract

### Backend event definitions

Every new or replacement module must add its event types to
`core/src/events/types.ts`.

A normal `v2` per-media module usually needs:

- one request event
- one or more queue-driving completion events
- optional queue-upsert helper events if later stages are enqueued from worker outcomes

Queue-driving completion events must carry either:

- `mediaId`
- `assetId`

That is how `getQueueTransitionMediaId(...)` resolves ownership.

### Frontend event definitions

If the frontend receives the event stream, mirror the required event types in
`src/types/events.ts`.

### Job lifecycle events

Every worker batch must emit:

1. `JobStarted`
2. zero or more `JobProgress`
3. exactly one terminal batch event:
   - `JobCompleted`
   - `JobFailed`

Required fields:

- `jobId`
- `pipelineStage`

## Worker Contract

Create the worker in `core/src/jobs/<name>.ts`.

Workers should prefer an object parameter once the signature grows beyond a few
fields.

Worker requirements:

- be safe to re-run for the same asset where practical
- write outputs to stable tables
- emit batch lifecycle events
- emit per-row queue-driving completion events
- write per-asset issues to `processing_issues`
- honor `AbortSignal` if the worker can run long
- release or requeue unprocessed claimed rows when the declared rate-limit strategy defers work

The worker owns persistence logic.

The coordinator decides when to run it.

## Workflow Module Contract

Add a `WorkflowModuleDefinition` in `core/src/coordinator/workflowModules.ts`.

Each module contains:

- `id`
- `description`
- `enabledByDefault`
- optional lifecycle/compatibility metadata
- `stagePolicies`
- `transitionRules`

### Stage policy rules

Use `activeCounter: 'task_queue'` when queue rows themselves are the best signal
of active work.

Use `activeCounter: 'jobs_running'` when:

- the worker should not dispatch another batch while a matching job is running
- stable job ownership is part of correctness
- the stage is a signal stage

If `activeCounter` is `jobs_running`, you must supply `jobsRunningLike`.

If `batchOwnership.mode` is `job_id`, you must supply `jobIdPrefix`.

### Dispatch rules

Dispatch support is still explicit in coordinator code.

If your module needs a new request event:

1. add the event type to `core/src/events/types.ts`
2. extend the dispatch union in `core/src/coordinator/workflows.ts`
3. extend `emitDispatchEvent(...)` in `core/src/coordinator/index.ts`
4. subscribe to the request event in `core/src/main.ts`

### Transition rules

Current action support is still intentionally narrow:

- `queue_upsert`
- `queue_complete`

Prefer using these actions instead of ad hoc coordinator cleanup.

## Replacement and Retirement Rules

When replacing an existing built-in module:

- keep the old module in code as `legacy`
- disable it by default once the replacement is ready
- give the replacement a new module ID
- give the replacement new internal stage names
- decide storage compatibility explicitly
- decide monitoring compatibility explicitly

Default replacement policy for built-ins:

- keep final user-facing results in the canonical storage shape when practical
- use new stage names and job ID families internally
- merge monitoring where continuity helps operators
- remove legacy queue/data paths only after migration verification

## Acceptance Checklist

The implementing AI must verify all of the following.

### Static checks

- changed TypeScript passes `npm run quality:staged`
- larger changes pass `npm run quality`
- changed Markdown passes `npm run lint:md`

### Runtime checks

- trigger events queue the expected stage rows
- the coordinator dispatches the request event
- owned batches claim only their own queue rows
- per-row completion events complete only the matching stage row
- a second batch in the same stage is not completed or failed by the first batch
- rate-limit deferral leaves deferred work visible and retryable
- batch-fatal failure fails only the rows claimed by that batch
- per-asset issues land in `processing_issues`
- dashboard/job snapshots still reflect replacement and legacy work correctly during transition

### Reject conditions

The module is not acceptable if any of these are true:

- it only works through a direct command and not the workflow path
- it uses `JobFailed` for per-asset warnings
- it omits `pipelineStage` on terminal events
- it depends on stage-wide bulk finalization for correctness
- it completes or fails rows not owned by the dispatched batch
- it claims `rate_limit_strategy` behavior that the code does not actually implement
- it replaces a legacy built-in module without documenting retirement behavior

## Legacy AI Metadata Exception

The current `ai_metadata_pipeline` is retained as a legacy exception.

Its limitations are known:

- legacy stage names remain visible in historical data
- older logic finalizes rows stage-wide instead of per owned batch
- older manual triggers bypassed queue ownership

New modules must not copy that pattern.

The replacement metadata path should instead use:

- new internal stage names
- owned batch job IDs
- per-row completion events
- explicit rate-limit behavior
- merged or split monitoring chosen deliberately

## Guidance For Future v3

Do not turn `v2` into a plugin/package system.

The next spec should first introduce:

- first-class execution IDs
- explicit retry scheduling
- stage lifecycle events beyond `Job*`
- persisted module manifests
- self-describing settings schemas
- install and trust boundaries for external modules

Until then, this document is the target contract for adding or replacing
workflow modules safely in the current subsystem.
