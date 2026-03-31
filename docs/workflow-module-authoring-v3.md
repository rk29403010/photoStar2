# Workflow Module Authoring

## Scope

This guide describes how to add new workflow-runtime modules in PhotoStar.

PhotoStar no longer supports the older queue-driven workflow path. New
automation work must be implemented as workflow-runtime modules and workflow
definitions only.

## Module Rules

- A module must declare stable `id` and `version` fields.
- A module must declare which subject types it accepts.
- A module must declare the artifacts it produces.
- A module should read and write persisted state directly through repository
  tables or helper functions.
- A module may emit runtime-safe events such as `AssetUpdated` when the UI
  needs a refreshed projection.
- A module should avoid hidden global state and should not depend on queue rows
  or paused-module settings.

## In-Photo Coordinate Standard

If a module stores any rectangle or box that refers to an area inside a photo,
it must normalize that data before persistence.

Stored in-photo coordinates use this canonical shape:

```ts
{
  x: number,
  y: number,
  width: number,
  height: number
}
```

Rules:

- values are normalized fractions in the `0..1` image space
- origin is the top-left of the full original photo
- `x` and `y` are the top-left corner
- `width` and `height` are the box extents
- modules must convert external or model-specific coordinate formats into this
  shape before writing to the database
- UI consumers are allowed to assume stored boxes already follow this standard
  and should not contain source-specific coordinate guessing logic

## Implementation Shape

Runtime modules live under `src/services/workflowRuntime/modules/`.

Typical structure:

1. Read the current subject and any required batch context.
2. Validate required persisted inputs.
3. Perform the domain work.
4. Persist the resulting artifacts or updated state.
5. Return declared outputs.

## Registration

To use a new module:

1. Export a `create...Module` factory from `src/services/workflowRuntime/modules/`.
2. Register the module in `src/entrypoints/core/main.ts`.
3. Reference the module from a workflow definition in
   `src/services/workflowRuntime/workflows/`.

## Workflow Design Guidance

- Prefer explicit workflow definitions over command-specific branching.
- Use `for_each` and `collect` nodes to model per-asset and batch transitions.
- Use milestones for user-facing progress checkpoints.
- Keep workflow IDs and node IDs stable once they are shipped.

## Dashboard Expectations

If a new module or workflow is user-visible, make sure the runtime projections
remain understandable in:

- workflow status summaries
- workflow run detail views
- recent events
- data coverage panels, where relevant

## Anti-Patterns

Do not:

- add queue tables or queue status projections
- add legacy request events as a control surface
- add pause/resume state tied to module IDs
- add compatibility adapters for removed workflow systems

## Related Files

- `src/services/workflowRuntime/contracts.ts`
- `src/services/workflowRuntime/moduleRegistry.ts`
- `src/services/workflowRuntime/workflowRegistry.ts`
- `src/services/workflowRuntime/orchestrator.ts`
- `src/services/handlers/systemWorkflowRuntimeCommands.ts`
