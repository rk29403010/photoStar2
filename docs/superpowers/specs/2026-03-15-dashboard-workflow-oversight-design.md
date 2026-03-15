# Dashboard Workflow Oversight Design

**Date:** 2026-03-15

**Status:** Approved in brainstorming

**Related docs:**

- `docs/superpowers/specs/2026-03-13-workflow-runtime-platform-design.md`
- `docs/superpowers/specs/2026-03-15-workflow-visualiser-design.md`
- `src/ui/components/DashboardView.tsx`
- `src/ui/components/dashboard/WorkflowRunsPanel.tsx`
- `src/services/handlers/systemWorkflowRunSnapshot.ts`

## Goal

Revamp the dashboard so it reflects the new workflow-native runtime only and
removes dependence on the old coordinator/module/queue mental model.

The dashboard remains an oversight surface, not a workflow-definition or raw
execution-inspection screen.

## Product decisions

The approved product decisions are:

- the dashboard gives equal weight to live workflow operations and library
  completeness reporting
- the dashboard is generic across workflows, not hard-coded only to
  `folder_ingest_v1`
- the dashboard supports remediation actions directly from oversight surfaces
- the workflow visualiser remains the deep-inspection destination for run and
  graph detail
- the old workflow model, module tabs, queue tabs, and legacy dashboard data
  mappings are treated as transitional and should be removed from the new
  dashboard

## Why this redesign is needed

The current dashboard is still organised around legacy operational concepts:

- system modules
- queue stage tables
- raw recent events
- job-error groupings tied to legacy task and job identifiers

That no longer matches the direction of the product or the underlying runtime.

The workflow runtime now has stronger source concepts:

- workflow definitions
- workflow runs
- step runs
- subject executions
- milestone progress

The dashboard should therefore answer oversight questions using workflow-native
and library-native projections instead of compatibility-era pipeline views.

## What the dashboard must answer

The dashboard should let a user quickly answer questions such as:

- what workflows are currently running, queued, blocked, failed, or recently
  completed?
- what items failed during processing, and what is the next corrective action?
- how complete is the library by workflow outcome or enrichment coverage?
- what kinds of images or subject categories exist in the collection?

Examples include:

- "What's the current status of any/all workflows running?"
- "What images had errors when processed, and how do I fix the issues?"
- "How many images have extended metadata?"
- "How many gravestone images are there?"

## Core design principle

There should be one canonical workflow-oversight projection layer for the
dashboard, just as the workflow visualiser has a canonical visualisation
projection.

The React dashboard should read one UI-facing snapshot contract instead of
assembling its own understanding from:

- background jobs
- queue stage rows
- task-specific error tables
- workflow run snippets

This avoids another hybrid dashboard where legacy and runtime concepts compete
for meaning.

## Recommended product shape

The dashboard becomes a single workflow-oversight overview page with four
persistent sections.

### 1. Workflow Status

This is the top-level run-health area.

It replaces most of the current `Modules`, `Queues`, and shallow workflow-runs
summary UI.

It should show:

- active workflows grouped by workflow type
- latest completed and failed runs
- run counts by status
- milestone state
- blocked, stalled, or waiting-for-input runs
- links into the workflow visualiser for drill-down

This section is the primary answer to "what is running right now?"

### 2. Attention Needed

This is the remediation surface.

It replaces the current module-based error history and surfaces issues in terms
of workflow runs, steps, and affected items.

It should show:

- failed items grouped by workflow and failure reason
- warning states that need operator review
- missing prerequisites or blocked workflow states
- the affected images or subjects where available
- recommended next actions

This section is the primary answer to "what broke and what do I do next?"

### 3. Coverage & Completeness

This section keeps the useful intent of the current data metrics while changing
the language from legacy pipeline internals to library outcomes.

It should show:

- assets with extended metadata
- assets with people detected or resolved
- assets that reached key workflow outcomes
- assets missing expected enrichment for supported workflows
- percentages as well as absolute counts

This section is the primary answer to "how complete is the collection?"

### 4. Collection Composition

This section reports the makeup of the library using workflow-relevant
categories and extracted subject types.

It should show counts for categories such as:

- gravestone images
- portraits
- documents
- pets
- future workflow-native subject types such as `landmark` or `memory`

In the current repo, gravestone counting is likely first sourced from stored AI
metadata classification and can later evolve into a first-class subject or
workflow outcome.

## What carries over from the current dashboard

Useful current behavior should be retained conceptually:

- the recent workflow activity summary from `WorkflowRunsPanel`
- metric-card presentation from `DataStatsPanel`
- paged issue browsing from `SystemErrorsPanel`

What should not carry over as first-class navigation:

- module-oriented terminology
- queue-stage tables
- raw events as a primary dashboard tab
- UI feed as a primary dashboard tab

Raw events and UI feed can remain as secondary audit or debug affordances if
still useful elsewhere, but not as the main dashboard model.

## Relationship to the workflow visualiser

The dashboard and visualiser have different jobs.

The dashboard is for:

- oversight
- prioritisation
- remediation
- collection health

The workflow visualiser is for:

- workflow definition understanding
- stage and node drill-down
- runtime graph inspection
- definition-plus-run context

The dashboard should link into the visualiser when the user needs deeper run or
graph detail, but should not duplicate that full inspection experience.

## Canonical dashboard snapshot

The recommended boundary contract is one canonical dashboard snapshot composed
of four blocks:

- `workflowStatus`
- `attentionItems`
- `coverageMetrics`
- `collectionComposition`

This snapshot should be assembled by a backend projection layer from runtime and
library data.

### `workflowStatus`

Should include:

- per-workflow-type status counts
- active-run summaries
- recent failed/completed runs
- milestone summaries
- blocked or stalled indicators
- links or identifiers for workflow-visualiser drill-down

### `attentionItems`

Should include:

- issue id and issue class
- workflow id, run id, node id, and affected item references where applicable
- concise problem summary
- operator-facing explanation
- severity and urgency
- recommended remediation actions

### `coverageMetrics`

Should include:

- absolute counts
- percentages
- labels and help text
- optional workflow or subject-type scope

The existing "photos with extended metadata" metric is a good example of a
metric that should stay, but be expressed in workflow-neutral language.

### `collectionComposition`

Should include:

- counts by image class or derived type
- optional percentages of total library size
- the source of classification where relevant
- links to filtered library views for inspection

## Genericity strategy

The dashboard must be generic across workflows without forcing the UI to know
every workflow's semantics.

That means:

- standard dashboard contracts define the common shape
- workflow-specific projection logic stays in backend projection code
- workflow definitions can optionally contribute presentation metadata for
  oversight naming and grouping
- the React UI renders generic cards, tables, and action lists from the shared
  snapshot

This follows the same boundary discipline as the workflow visualiser design:
runtime internals stay behind projection contracts rather than leaking directly
into UI code.

## Remediation model

The dashboard is not read-only. Attention items should carry explicit actions.

Supported action types should include:

- retry failed item
- retry failed step for selected items
- open workflow visualiser on a run or node
- open affected assets in the library with a pre-applied filter
- pause or resume a workflow type when a systemic issue appears
- acknowledge or dismiss non-blocking warnings when appropriate

The dashboard remains an oversight tool, not a full operator console, so action
scope should stay bounded and reviewable.

## Data sources and migration

The new dashboard should stop treating legacy job and queue projections as the
main source model.

Preferred source hierarchy:

1. workflow runtime truth such as workflow runs, step runs, subject executions,
   and milestones
2. library facts such as derived metadata, stored subject relationships, and
   asset counts
3. limited compatibility projections only where runtime-native replacements do
   not yet exist

This means current dashboard contracts in `src/boundary/contracts/jobs.ts` are
not the right long-term home for the new dashboard snapshot.

The recommended implementation is a new workflow-dashboard contract family in
the boundary layer.

## Architecture impact

Expected architecture:

1. backend projection services read workflow runtime state and library-derived
   metrics
2. boundary contracts define the dashboard snapshot and remediation action
   payloads
3. the UI dashboard renders one workflow-oversight overview from that snapshot
4. action handlers trigger retry, pause, resume, or navigation flows through
   explicit commands

This architecture removes the current dashboard's dependence on:

- legacy stage-name taxonomies
- task-to-module mapping SQL
- queue-stage-first visibility

## Non-goals for v1

This redesign does not attempt to provide:

- workflow editing
- raw event-log inspection as a primary dashboard concern
- a bespoke dashboard implementation per workflow
- full replacement of every historical compatibility data source on day one
- advanced analytics beyond oversight and remediation

## Testing strategy

Testing should focus on the new projection model and the dashboard's user-facing
behavior.

Required coverage:

- projection tests for workflow-status summaries
- projection tests for attention-item generation and remediation metadata
- projection tests for coverage and composition metrics
- UI rendering tests for the new overview layout
- command tests for remediation actions

Verification expectations:

- use `npm run quality:staged` while iterating
- run complexity checks if projection logic or dashboard orchestration becomes
  branch-heavy
- run `npm run quality` before handoff of implementation work

## Recommended implementation order

1. define the new workflow-dashboard boundary contracts
2. build backend projection helpers for status, attention, coverage, and
   composition
3. replace the current dashboard tab shell with the new overview layout
4. wire the dashboard to the new snapshot contract
5. add remediation command handlers and UI actions
6. remove obsolete legacy dashboard tabs and mappings
7. follow with visual refinement once the data model is stable
