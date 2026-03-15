# Workflow Visualiser Design

**Date:** 2026-03-15

**Status:** Approved in brainstorming

**Related docs:**

- `docs/architecture.md`
- `docs/superpowers/specs/2026-03-13-workflow-runtime-platform-design.md`
- `docs/superpowers/specs/2026-03-13-folder-ingest-v1-design.md`
- `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`

## Goal

Add a dedicated workflow visualiser UI that makes runtime-native workflows
understandable to users who think in traditional step progression, while still
exposing the event-driven and DAG-oriented reality of the runtime.

The first workflow shown is `folder_ingest_v1`, but the design must support any
workflow defined by `src/services/workflowRuntime/`.

## Product decisions

The approved product decisions are:

- the visualiser is a dedicated workspace, not part of the dashboard
- it is accessed from the `Actions` menu next to settings
- the initial landing view opens directly into the ingest workflow
- the screen supports both workflow definition and live run state together
- the primary tabs are `Overview`, `Progression`, `Runtime graph`, and `Text`
- the first version is read-mostly but supports drill-down on stages and nodes
- the text view is a structured outline, not a prose-only narrative or raw spec
- runtime-native workflows are the only supported source model for v1
- the screen anchors on the workflow definition plus the active run if one
  exists, otherwise the latest completed run
- an established graph library may be used for the runtime-graph tab if it
  materially helps, but the rest of the experience stays custom

## Why this feature exists

The workflow runtime is now the real orchestration model for `folder_ingest_v1`,
but the current UI only exposes shallow run summaries.

That is not enough for the next steps on the roadmap:

- future custom workflows
- pluggable workflow modules
- user trust in event-driven orchestration
- reviewable inspection when workflows branch and fan in

The design therefore needs to do two jobs at once:

1. explain the workflow in user language
2. stay faithful to the runtime-native execution model

## Core design principle

There should be one canonical workflow-visualisation projection layer that turns
runtime definitions and run detail into a presentation-ready model. Every tab in
the workflow workspace reads from that same projection.

This avoids drift between:

- the traditional progression view
- the engine-faithful runtime graph
- the overview summary
- the structured text view

The graph tab may use a library for rendering, but not as the source of truth
for the rest of the UI.

## User experience

### Entry point

The workflow visualiser is opened from the `Actions` panel as a dedicated
workspace entry beside settings.

It is not embedded into the dashboard because the experience needs enough room
for:

- tabbed views
- graph and progression presentations
- run selection context
- node and stage drill-down

### Initial landing

The first version opens directly into `folder_ingest_v1`.

This is honest about the current system state while leaving room to add a
workflow picker later once more runtime-native workflows exist.

### Primary screen structure

The workflow workspace has a stable header plus four tabs:

`Overview`
: High-level summary of the workflow, milestone state, current run context, and
  the relationship between progression and runtime views.

`Progression`
: The traditional workflow view that presents the movement of a file or photo
  through major stages. Branching is shown where it matters, but the layout
  privileges user comprehension over engine detail.

`Runtime graph`
: The DAG-faithful representation of nodes, edges, fan-out, fan-in, and control
  nodes.

`Text`
: A structured outline of workflow inputs, parameters, milestones, stages,
  branches, and run status.

### Run anchoring

The screen always shows the workflow definition as the stable primary object.

Run state is an overlay:

- if an active run exists, use that as the default context
- otherwise use the latest completed run

This keeps the page useful even when no workflow is currently running.

### Drill-down behavior

Clicking a stage or node opens a detail pane with:

- label and purpose
- upstream and downstream links
- milestone contribution
- counts for pending, running, completed, failed, and skipped work
- run parameters or gating conditions where relevant
- related issues or failure summaries

The goal is interactive inspection, not raw operator tooling. Event payload
inspection remains outside the workflow workspace in v1.

## Presentation model

The backend runtime model is not shown directly to users. The boundary layer
must convert it into presentation concepts.

### Canonical workflow visualisation model

The projection should produce a UI-facing model with at least:

- workflow definition summary
- workflow parameters and input types
- visual nodes and edges
- progression stages and branch groups
- milestone summaries
- selected run summary
- per-node and per-stage status overlays
- structured text sections
- drill-down detail blocks

This model must be generic enough for any runtime-native workflow, while still
allowing workflow-specific presentation hints.

### Ingest-specific grouping

`folder_ingest_v1` should not be rendered as a flat list of runtime nodes.

Instead, the projection should group nodes into a more traditional progression
story:

- `scan-folder` becomes discovery
- `generate-previews` becomes library-ready preparation
- enrichment branches are shown as parallel downstream activity
- `library_ready` and `enrichment_complete` remain explicit milestones

The runtime graph still shows the actual DAG, but the progression view is
allowed to reinterpret those nodes into user-facing stages.

## Data and contracts

The current `WorkflowRunListItem` snapshot is a useful summary, but it is too
shallow to power the full visualiser.

### New backend needs

The design expects new or expanded handlers to expose:

- workflow definitions with presentation metadata
- richer workflow run detail than the current list snapshot
- enough node, milestone, and per-step state to build drill-down views

### Shared contracts

New shared contracts should define:

- workflow definition presentation data
- visualisation nodes, edges, and stage groups
- workflow run overlay status
- text-view sections
- drill-down detail payloads

These contracts should live in the boundary layer, not inside the UI.

## Library strategy

The recommended implementation bias is:

- custom React components for `Overview`, `Progression`, and `Text`
- optional graph library only for the `Runtime graph` tab

Reasons:

- the progression view is product-specific and should not inherit graph-tool
  abstractions
- the text view is a structured presentation concern, not a graph problem
- the graph tab is the only place where pan/zoom, automatic layout, and edge
  rendering may justify a dependency

Candidate graph tooling can be evaluated during implementation, but it must sit
behind the visualisation projection boundary.

## Architecture impact

This feature adds a new workflow workspace to the UI shell and introduces a new
presentation-focused boundary contract between runtime definitions and the UI.

The expected architecture is:

1. runtime-native workflow definitions stay in `src/services/workflowRuntime/`
2. backend handlers expose workflow definition and run-detail projections
3. boundary contracts define the workflow-visualisation shape
4. the UI renders four tabs from one canonical projection model

This keeps the feature aligned with the current architecture, where transport
and command contracts live in the boundary band rather than leaking runtime
internals directly into React components.

## Testing strategy

Testing should focus on the projection layer first.

Required coverage:

- workflow definition to visualisation projection
- ingest-specific progression grouping rules
- run overlay status mapping for nodes, stages, and milestones
- drill-down detail generation
- workflow workspace rendering and tab behavior

Verification expectations:

- use `npm run quality:staged` during iteration
- run targeted tests for new workflow projection and UI behavior
- run `npm run quality` before handoff for the full feature

## Non-goals for v1

This feature does not attempt to solve:

- workflow editing
- arbitrary end-user custom workflow authoring
- support for the legacy coordinator path
- embedded raw event-log analysis inside the workflow screen
- a full workflow catalog experience before multiple runtime-native workflows
  exist

## Recommended implementation order

1. add workflow workspace navigation from the `Actions` menu
2. add shared workflow-visualisation contracts and backend handlers
3. implement the canonical projection layer for runtime-native workflows
4. build the `Overview` and `Text` tabs first to validate the data model
5. build the `Progression` tab with ingest-specific grouping rules
6. add the `Runtime graph` tab, using a library only if evaluation justifies it
7. add node and stage drill-down

This sequence validates the core projection model before spending time on graph
rendering details.
