# Workflow Visualisation Any System Workflow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Workflow Visualisation view open any registered system workflow, remember the last workflow the user viewed, and fall back to `folder_ingest_v1` when no prior choice exists.

**Architecture:** Add a lightweight workflow-list contract backed by the workflow registry, persist the selected workflow id in app UI state, and feed that state into the existing generic `WorkflowWorkspace`. Extend the workspace header with a workflow selector while keeping ingest-only recovery actions scoped to `folder_ingest_v1`.

**Tech Stack:** React, TypeScript, persisted UI state hooks, existing workflow runtime/registry services, Vitest or the repo’s current UI test harness, npm quality scripts.

---

## File Map

- Modify: `src/ui/hooks/useAppRuntimeUi.ts`
- Modify: `src/ui/components/app/AppMainContent.tsx`
- Modify: `src/ui/components/workflows/WorkflowWorkspace.tsx`
- Modify: `src/ui/components/workflows/WorkflowWorkspaceHeader.tsx`
- Modify: `src/boundary/contracts/workflowVisualiser.ts`
- Modify: `src/ui/hooks/usePhotoLibrary.coreActions.ts`
- Modify: workflow visualiser service/handler files that provide contracts to the UI
- Add or modify: focused tests covering app workflow selection and workflow header selection behavior

## Chunk 1: Workflow Selection Contract

### Task 1: Add a registered-workflow summary contract

**Files:**

- Modify: `src/boundary/contracts/workflowVisualiser.ts`
- Modify: service/handler files that assemble workflow visualiser responses
- Test: workflow handler tests covering workflow list output

- [ ] **Step 1: Write the failing test**

Add a test that requests workflow visualiser support data and expects at least `folder_ingest_v1` plus another registered workflow summary with `id` and `displayName`.

- [ ] **Step 2: Run test to verify it fails**

Run the focused workflow handler test command for the new case.
Expected: FAIL because the contract does not yet expose registered workflows.

- [ ] **Step 3: Write minimal implementation**

Add a lightweight workflow summary type and return registry-backed workflow summaries through the relevant handler/API surface.

- [ ] **Step 4: Run test to verify it passes**

Re-run the focused handler test command.
Expected: PASS.

- [ ] **Step 5: Commit**

Commit the contract slice once tests are green.

## Chunk 2: Persisted Workflow View State

### Task 2: Add selected workflow state with fallback behavior

**Files:**

- Modify: `src/ui/hooks/useAppRuntimeUi.ts`
- Modify: `src/ui/components/app/AppMainContent.tsx`
- Test: UI state or app content tests covering selected workflow persistence

- [ ] **Step 1: Write the failing test**

Add a UI-focused test proving the workflows view uses the persisted selected workflow id and falls back to `folder_ingest_v1` when the persisted value is missing or invalid.

- [ ] **Step 2: Run test to verify it fails**

Run the focused UI test file for app state/content.
Expected: FAIL because the workflows view is still hardcoded to ingest.

- [ ] **Step 3: Write minimal implementation**

Persist `selectedWorkflowId` in app UI state, validate it against the available workflow list, and pass the resolved workflow id into `WorkflowWorkspace`.

- [ ] **Step 4: Run test to verify it passes**

Re-run the focused UI test command.
Expected: PASS.

- [ ] **Step 5: Commit**

Commit the app-state slice once tests are green.

## Chunk 3: Workspace Header Selection UX

### Task 3: Add the workflow selector to the visualiser header

**Files:**

- Modify: `src/ui/components/workflows/WorkflowWorkspace.tsx`
- Modify: `src/ui/components/workflows/WorkflowWorkspaceHeader.tsx`
- Test: workflow workspace/header tests

- [ ] **Step 1: Write the failing test**

Add a component test that renders the workflow header with multiple registered workflows and verifies:

- the selector includes every workflow option;
- choosing a new workflow calls the selection callback;
- the retry button remains hidden for non-ingest workflows.

- [ ] **Step 2: Run test to verify it fails**

Run the focused workflow workspace/header test file.
Expected: FAIL because the header has no workflow selector yet.

- [ ] **Step 3: Write minimal implementation**

Thread workflow summaries and selection callbacks into the workspace header, render the selector, and keep ingest-only retry controls gated to `folder_ingest_v1`.

- [ ] **Step 4: Run test to verify it passes**

Re-run the focused header/workspace tests.
Expected: PASS.

- [ ] **Step 5: Commit**

Commit the workflow selector slice once tests are green.

## Chunk 4: Integration Verification

### Task 4: Run staged quality checks for the changed slice

**Files:**

- Modify: none
- Test: changed-file quality scripts

- [ ] **Step 1: Run focused staged checks**

Run: `npm.cmd run quality:staged -- --files=src/ui/hooks/useAppRuntimeUi.ts,src/ui/components/app/AppMainContent.tsx,src/ui/components/workflows/WorkflowWorkspace.tsx,src/ui/components/workflows/WorkflowWorkspaceHeader.tsx,src/boundary/contracts/workflowVisualiser.ts`
Expected: PASS.

- [ ] **Step 2: Run complexity guard if branch-heavy code changed**

Run: `npm.cmd run complexity:staged -- --files=src/ui/hooks/useAppRuntimeUi.ts,src/ui/components/app/AppMainContent.tsx,src/ui/components/workflows/WorkflowWorkspace.tsx,src/ui/components/workflows/WorkflowWorkspaceHeader.tsx`
Expected: PASS.

- [ ] **Step 3: Run broader repo quality before handoff**

Run: `npm.cmd run quality`
Expected: PASS.

- [ ] **Step 4: Commit final verification or follow-up fixes**

Commit any final polish required by the verification steps.
