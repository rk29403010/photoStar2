# Workflow Visualisation Any System Workflow Design

## Goal

Allow Workflow Visualisation to open and switch between any registered system workflow instead of being hardcoded to `folder_ingest_v1`.

## Current Problem

The workflow visualiser stack is already parameterised by `workflowId`, but the app content layer always mounts the workflow workspace with `workflowId="folder_ingest_v1"`. That means the visualiser cannot be used to inspect other system workflows even though the backend already understands them.

## User-Facing Behavior

- The top-menu Workflow button opens the Workflow Visualisation view.
- The view restores the last workflow the user looked at.
- If there is no saved selection yet, the view falls back to `folder_ingest_v1`.
- The workflow header includes a selector listing every registered system workflow.
- Changing the selector reloads the workspace for the chosen workflow and persists that choice for the next visit.

## Architecture

### Backend

Expose a lightweight query for registered workflows using the existing workflow registry. The UI only needs a stable list of workflow ids and display names, so the new contract should stay minimal and avoid duplicating visualiser data.

### UI State

Persist the selected workflow id alongside the existing persisted app UI state. This lets the top-level app decide which workflow the workspace should mount without hardcoding a single definition.

### Workflow Workspace

Keep `WorkflowWorkspace` generic and continue to fetch its model by `workflowId`. Add the workflow selector to the workspace header so the current workflow can be changed in-place without introducing a second route or modal.

### Special-Case Retry

The “rerun missing folder AI metadata” action remains specific to `folder_ingest_v1`. Other workflows can be visualised but do not gain ingest-only controls.

## Data Flow

1. App startup loads the persisted selected workflow id.
2. The workflows view requests the registry-backed workflow list.
3. `AppMainContent` passes the selected workflow id into `WorkflowWorkspace`.
4. `WorkflowWorkspaceHeader` renders the workflow selector from the fetched list.
5. Selecting a workflow updates persisted app state and remounts or reloads the workspace for the new workflow id.

## Error Handling

- If the saved workflow id is no longer registered, the UI falls back to `folder_ingest_v1`.
- If the workflow list cannot be loaded, the workspace should show the existing unavailable/error state rather than silently reverting to ingest.
- If a workflow has no runs, the existing “definition only” behavior remains available.

## Testing

- Add a failing UI test proving the workflows view uses the persisted selected workflow id and falls back to `folder_ingest_v1`.
- Add a failing test proving the workflow header selector lists all available workflows and notifies the parent when selection changes.
- Keep existing ingest-only retry behavior covered so the new selector does not surface that action for other workflows.
