# Ingest Finalize Node Summary

Date: 2026-03-26

## Current Position

We split photo-date estimation into separate workflow nodes inside the ingest enrichment stage:

- `estimate-photo-date-from-embedded`
- `estimate-photo-date-from-ai`

This matches the idea that a workflow hosts module instances, not just module definitions, and allows separate node-level settings later.

We explicitly deferred adding a finalize node in this pass.

## Why Finalize Is Not Simple

A finalize step should be per asset, not per folder.

If finalization were per folder, the slowest enrichment branch would hold the whole ingest open. That does not fit the intended runtime model, where:

- library browsing becomes available early;
- enrichment can continue for hours;
- work may resume across multiple app sessions;
- lower-priority branches can tick away in the background.

## Recommended Direction

Introduce a per-asset finalize node later.

That node should represent:

- "this asset has reached the required completion state for this workflow path"

It should not mean:

- "all possible enrichment work for the folder is finished"

## Conditional Branching Requirement

We expect a future decision-type node after `detect-sensitive-content`.

Planned behavior:

- non-sensitive assets:
  - continue to `generate-ai-metadata`
  - then to AI-driven date estimation
  - then to finalize
- sensitive assets:
  - skip `generate-ai-metadata`
  - go directly to finalize

That means finalize cannot simply wait for every branch in the graph. It must wait for all required branches for the current asset path.

## Implications

The future finalize design likely needs:

- per-asset completion semantics
- conditional branch routing
- optional branch completion
- a distinction between:
  - `library_ready`
  - asset-level enrichment completion
  - background enrichment still in progress elsewhere

It may also want explicit asset status fields rather than relying only on run milestones.

## Open Questions For Later

1. Should finalize be a control node, a module node, or a new runtime concept?
2. How should asset-level completion be persisted?
3. Which branches are mandatory for "ingested enough" versus optional/background?
4. How should a resumed app decide which assets still need finalize work?
5. Should workflow milestones remain run-level only, or also gain asset-level projections?

## Suggested Next Step

When this work is resumed, start with a short design pass focused on:

- decision nodes
- per-asset finalization
- conditional branch joins
- asset completion across multiple runs/sessions
