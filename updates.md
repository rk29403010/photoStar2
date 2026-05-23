# Updates Log

## [0.1.88] - 2026-05-23T05:55:00Z

- Implemented dynamic highlight selection range preview during pointer drag in multi-select mode.
- Prevented default browser thumbnail/button dragging behavior to allow uninterrupted pointer-select movements.
- Configured drag range selection to commit only upon releasing the pointer.

## [0.1.87] - 2026-05-23T04:52:00Z

- Refined selection event handlers to ensure normal clicks always open photos when selection is empty (completely ignoring info panel visibility state).
- Configured double-clicks on assets to do nothing.

## [0.1.86] - 2026-05-23T04:14:00Z

- Restructured click and long-press event handlers in `LayoutEngine` to fix multi-photo selection UX.
- Assured normal clicks open single photo view when selection is empty and info panel is hidden.
- Ensured long clicks start multi-select mode, and subsequent normal clicks toggle selection on assets.

## [0.1.85] - 2026-05-12T09:45:00Z

- Synchronized React Flow node selection with external navigation, ensuring the Sequence Map correctly highlights nodes when navigated via upstream/downstream links in the detail panel.

## [0.1.84] - 2026-05-12T08:35:00Z

- Fixed Sequence Map highlighting to work on both nodes and stages.
- Switched highlight color to Amber (`amber-400`) for better contrast against cyan arrows.
- Made upstream and downstream node IDs clickable in the Module Viewer to enable rapid navigation.
- Fixed a bug where `nodes` were missing from the React Flow node builder, causing rendering issues.

## [0.1.83] - 2026-05-12T00:50:00Z

- Overhauled Sequence Map layout algorithm with a vertical-first tree placement strategy.
- Implemented column management: primary children stay in the parent's column, while branches shift to the next free column.
- Refined edge routing: Failure paths exit from the right side of nodes, and success stage-exit paths exit from the bottom.
- Added visual highlighting for the currently selected node/stage in the Sequence Map.
- Enhanced Module Viewer to display Node ID and Module ID for better transparency.
- Refactored `workflowSequenceMapModel.ts` layout logic into smaller helpers to satisfy cyclomatic complexity standards (<= 10).

## [0.1.82] - 2026-05-10T11:15:00Z

- Enhanced Workflow Visualiser to render `onFailureTo` paths as red arrows.
- Updated `WorkflowVisualiserGraphEdge` contract to support edge `kind` (default vs failure).
- Improved Sequence Map layout by pushing "stage-exit" nodes (nodes with no internal downstream) to the rightmost level, preventing arrows from crossing through other nodes.
- Fixed upstream/downstream tracking in `systemWorkflowVisualiser.ts` to include `onFailureTo` connections.
- Refactored `buildStageLevels` and `buildGraph` to maintain cyclomatic complexity standards (<= 10).

## [0.1.81] - 2026-05-10T10:30:00Z

- Implemented `onFailureTo` support in Workflow Orchestrator and Contracts, enabling explicit error-handling branches in workflows.
- Expanded `runtime.simulation_workflow` with parallel fast steps and a complex branching structure in the Medium Processing stage.
- Added 3-branch medium processing simulation: Successful Branch 1 (3 steps), Successful Branch 2 (1 step), and Failure Branch (Error Cleanup).
- Refactored orchestrator and contract validation to maintain cyclomatic complexity standards (<= 10).

## [0.1.80] - 2026-05-10T08:00:00Z

- Enhanced Workflow Orchestrator to support node-specific parameter overrides in `contracts.ts` and `orchestrator.ts`.
- Fixed simulation workflow logic to correctly transition from folder discovery (enumerator mode) to asset processing (task mode).
- Implemented subject filtering in `orchestrator.ts` to ensure failed items are not propagated to downstream workflow nodes.
- Tuned `simulatorModule.ts` execution times for improved testing performance and UI responsiveness.

## [0.1.79] - 2026-05-09T11:00:00Z

- Fixed Workflow Simulator's Sequence Map rendering by explicitly mapping milestones to stages in `systemWorkflowVisualiser.ts`.
- Resolved parameter propagation logic in `systemWorkflowRuntimeCommands.ts` to ensure `iterations` defaults correctly to 400 when triggered from UI.

## [0.1.78] - 2026-05-05T13:40:00Z

- Addressed wide range of SonarQube issues (S6819, S1077, S6848, S1082, S6564, S3735, S6845, S6479, S7735, S6571, S7781, S6551).
- Converted non-native interactive elements to native `<button>` and `<input>` elements.
- Added `alt` tags to `img` elements in `PeopleView`.
- Enabled `react/jsx-key` and `unicorn/prefer-string-replace-all` autofixes in `.oxlintrc.json`.
- Updated `AGENTS.md` with detailed SonarQube compliance guardrails.

## [0.1.77] - 2026-05-05T13:24:00Z

- Systematically refactored `no-nested-ternary` ESLint violations across the UI codebase using IIFE-based logic.
- Reduced complexity in `usePhotoLibrary.coreActions.ts` by extracting `useDevActions`.
- Verified global compliance with `quality:staged` gate.

## [0.1.76] - 2026-05-05T10:15:00Z

- Addressed SonarQube findings by extracting a union type into `ActiveInfoTab` in `SinglePhotoView.tsx`.
- Changed `<div role="dialog">` to `<dialog>` in `ActionPanel.tsx`.
- Refactored a nested ternary operation into a cleaner if-else block in `LayoutEngine.tsx`.
- Added accessibility attributes (`role="button"`, `tabIndex`, `onKeyDown`) to the non-native interactive element in `LayoutEngine.tsx`.
- Added specific SonarQube compliance instructions to `AGENTS.md` and enabled `no-nested-ternary` in `eslint.config.js`.

## [0.1.75] - 2026-05-05T08:15:00Z

- Configured ESLint and Oxlint with `react/prefer-read-only-props`, `@typescript-eslint/consistent-type-definitions: type`, `unicorn/no-typeof-undefined` and `@typescript-eslint/no-deprecated`.
- Ran a global auto-fix pass to convert `interface` to `type` and make component props `readonly` across the codebase.
- Replaced usages of the deprecated `MutableRefObject` API with `RefObject`.
- Fixed `Timeout` vs `number` TypeScript errors caused by the previous `globalThis` auto-fix by typing refs with `ReturnType<typeof setTimeout> | null`.

## [0.1.74] - 2026-05-05T07:46:00Z

- Added several auto-fixable linting rules (`unicorn/prefer-global-this`, `prefer-template`, `react/jsx-curly-brace-presence`, etc.) to `.oxlintrc.json` and `eslint.config.js`.
- Ran global autofix pass across the repository.

## [0.1.73] - 2026-05-05T01:46:00Z

- Extracted `ManualPathPrompt` into its own component in `src/ui/components/ActionPanel.tsx` to resolve ESLint cyclomatic complexity and max lines limits.
