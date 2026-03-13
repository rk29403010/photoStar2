# Workflow Runtime Platform Design

**Date:** 2026-03-13

**Status:** Approved in brainstorming

**Related docs:**

- `docs/architecture.md`
- `docs/workflow-module-authoring-v2.md`

## Goal

Design a greenfield workflow runtime that can support:

- pluggable modules
- future subject types such as `pet`, `gravestone`, `landmark`, and `memory`
- overall progress and drill-down inspection
- typed workflow composition instead of ad hoc event coupling
- future `ai.studio` sandbox execution and promotion into production workflows

The design must prioritize how workflows run over how users edit them.

## Why the current model is not enough

The current coordinator, `task_queue`, and event bus model works for the
existing asset-enrichment pipeline, but it has structural limits:

- runtime state is inferred across `jobs`, `task_queue`, and events instead of
  being represented as first-class workflow executions
- the system is strongly asset-centric, which makes future first-class entities
  awkward
- orchestration events and domain facts are mixed together
- batch bars are a scheduling artifact, not a user-meaningful progress model
- plugin growth would likely turn into event-spaghetti without stronger runtime
  contracts

These limits matter because the roadmap is no longer just "process more photo
assets." It includes durable subject types and multi-stage reasoning, such as:

- pets with person-like presentation but different model pipelines
- gravestones with grouped views, preprocessing, text extraction, and
  multi-strategy resolution
- landmarks and place grouping
- memory and story generation across messy, cross-media data

## Decisions

The approved design choices are:

- build a greenfield runtime platform rather than extending the current
  coordinator in place
- use a typed subject model rather than a purely asset-first engine
- allow subject types to be introduced through a governed registry with
  declarative schemas the core UI can render generically
- connect modules through typed input and output ports rather than event
  subscriptions
- treat `workflow_run`, `step_run`, and per-subject execution records as the
  primary runtime truth
- use capability classes for approvals, budgets, and safety
- keep workflows as DAGs with explicit iterator and collector nodes
- use generic lifecycle telemetry for orchestration and progress, while still
  allowing optional domain-specific facts

## Runtime architecture

The runtime is centered on explicit executions over typed subjects.

### Core components

`SubjectRegistry`
: Defines subject types, identity rules, relations, searchable fields, progress
  semantics, and generic UI metadata.

`ModuleRegistry`
: Defines runtime modules with typed ports, declared capabilities, cost hints,
  failure policies, and execution handlers.

`WorkflowRegistry`
: Stores workflow definitions as DAGs composed from modules and built-in control
  nodes.

`RuntimeOrchestrator`
: Creates runs, expands iterators, schedules ready nodes, records execution
  state, enforces budgets and approvals, and advances the graph.

`ExecutionStore`
: Persists workflow definitions, subject instances, workflow runs, step runs,
  per-subject execution rows, artifacts, costs, telemetry, and errors.

`TelemetryBus`
: Emits a small generic lifecycle stream for dashboards, progress, and
  compatibility projections. Modules may also attach domain-specific facts.

### Execution model

The execution flow is:

1. A trigger creates a `workflow_run`.
2. The run binds one or more input subjects.
3. Iterator nodes expand those inputs into planned work items.
4. Ready `step_run` nodes dispatch module executions.
5. Each subject processed by a step records a `subject_execution`.
6. Module outputs create artifacts, annotations, relations, or new subjects.
7. Downstream nodes become ready when their declared inputs are satisfied.
8. The workflow completes when all reachable step runs are terminal.

In this model:

- `jobs` are telemetry or compatibility projections
- batches are scheduling details
- progress is derived from real execution rows, not inferred from job events

## Subject model

The runtime must support more than assets, but avoid an unbounded plugin object
model.

### Subject type contract

Every subject type must declare:

- `id` and `version`
- identity and merge rules
- summary fields such as title, subtitle, thumbnails, and key dates
- allowed relations to other subject types
- searchable and filterable facets
- generic UI hints for list and detail presentation
- progress semantics
- whether the subject is durable, derived, or internal-only

### Subject categories

The design distinguishes:

- durable user-facing subjects such as `asset`, `person`, `pet`, `gravestone`,
  `landmark`, and `memory`
- derived but user-visible subjects such as `story_draft`
- internal runtime subjects used only inside workflows

Plugins may define new subject types, but only through a validated declarative
schema that the core UI already knows how to render generically. Arbitrary
plugin frontend code is out of scope for v1.

## Module model

Modules are typed execution units. They are not responsible for graph control.

Each module declares:

- accepted subject types
- produced subject, artifact, annotation, or relation types
- capability class:
  `analyze`, `derive`, `group`, `annotate`, `mutate_library`, or `external_api`
- cost and budget hints
- determinism and idempotence hints
- retry and failure policy
- sandbox and side-effect rules
- whether it is safe for background automation, `ai.studio`, or manual use only

### Built-in control nodes

The runtime owns graph mechanics through built-in nodes:

- `for_each`
- `filter`
- `batch`
- `group_by`
- `collect`
- `merge`
- `reduce`
- `approval_gate`
- `budget_gate`

This separation is intentional:

- modules do domain work
- the runtime owns orchestration patterns

## Workflow model

Workflows are DAGs.

### Graph rules

- workflows are acyclic
- fan-out is explicit through iterator nodes
- fan-in is explicit through collector nodes
- approvals and budgets are explicit gate nodes
- loops are represented through visible graph structure, not hidden
  self-rescheduling

This keeps workflows inspectable, visualizable, and safe to customize later.

### Example workflow shapes

`Ingest enrichment`
: `for_each asset -> guess_date_taken`, `for_each asset -> dedupe_features`,
  `batch asset -> group_duplicates`, `batch asset -> group_similar`

`Gravestones`
: `for_each asset -> gravestone_candidate_detect -> group_by view similarity ->
  gravestone -> preprocess_views -> extract_text_multi_strategy -> collect ->
  resolve_best_inscription`

`Memories`
: `for_each asset -> theme/date/place tagging -> group_by temporal and social
  signals -> memory_candidate -> story_builder`

## Runtime persistence

The primary runtime records are:

- `subject_types`
- `module_definitions`
- `workflow_definitions`
- `subject_instances`
- `subject_relations`
- `workflow_runs`
- `step_runs`
- `subject_executions`
- `run_artifacts`
- `run_costs`
- `run_errors`
- `run_events`

### Primary execution hierarchy

`workflow_run`
: One invocation such as "ingest folder X" or "process selected gravestones."

`step_run`
: One workflow node execution within a run.

`subject_execution`
: One subject processed by one step. This is the real unit for progress,
  outcomes, and drill-down.

This is the basis for the progress model the user actually wants:

- overall workflow progress
- per-step progress
- success, failure, skipped, and pending counts
- grouped summaries by subject type, module, and capability

## Telemetry and event model

The current event set is too specific to stay as the primary long-term runtime
contract.

The new runtime should use a small generic lifecycle set for orchestration and
UI projections:

- `RunRequested`
- `RunStarted`
- `RunProgressed`
- `StepStarted`
- `StepProgressed`
- `ItemProduced`
- `ItemCompleted`
- `ItemFailed`
- `RunCompleted`
- `RunFailed`

Modules may also emit optional domain facts, for example:

- `PetCandidateDetected`
- `GravestoneInscriptionExtracted`
- `LandmarkMatched`
- `MemoryStoryDrafted`

The split is:

- generic lifecycle telemetry drives orchestration, overall progress, dashboard
  summaries, and compatibility projections
- domain-specific facts provide semantic richness and deep inspection

## Capabilities, budgets, and safety

Every module must declare a capability class.

This allows the runtime to attach policy such as:

- approval requirements for `mutate_library`
- budget enforcement for `external_api`
- sandbox restrictions for experimental modules
- undo or confirmation rules for state-changing workflows

Budgeting must support:

- per-run budgets
- per-module or per-provider budgets
- dry-run cost estimation where possible
- stop, downgrade, or require approval when budget gates are exceeded

## `ai.studio` alignment

The design supports `ai.studio`, but does not make it the driver of the
architecture.

`ai.studio` should be a client of the same runtime:

- choose one or more input subjects
- choose a module or workflow
- run in test or sandbox mode
- inspect outputs, artifacts, costs, and failures
- promote a module into a production workflow once validated

This requires the runtime to support:

- single-subject runs
- side-effect-free test execution
- artifact capture
- deterministic replay where feasible

## Migration strategy

The runtime should land as a separate platform inside the repo.

Recommended rollout:

- create the new runtime in its own service area
- wrap existing workers as adapter modules when that is useful
- expose compatibility translators from legacy job and event output into the new
  run telemetry model
- build new features on the new runtime first
- migrate legacy ingest and queue paths later, once the new runtime has enough
  coverage

The current coordinator remains the production orchestrator until new workflows
prove themselves.

## Non-goals for v1

The first runtime slice should not attempt all future ambitions at once.

Out of scope for v1:

- arbitrary plugin frontend code
- a full end-user visual workflow editor
- broad knowledge-graph reasoning across every entity class
- full replacement of all current ingest flows

## Recommended first implementation slice

The first implementation slice should prove the runtime without requiring a
full migration.

It should include:

- runtime contracts for subject types, modules, workflows, runs, and telemetry
- SQLite persistence for runs and subject executions
- a minimal orchestrator for DAG execution
- built-in iterator and collector nodes
- one pilot workflow over `asset`
- compatibility adapters for a small number of existing workers
- tests that prove progress, failure propagation, and inspection

This slice is enough to validate the new model before adding plugin packaging,
advanced subject types, or user-facing workflow customization.
