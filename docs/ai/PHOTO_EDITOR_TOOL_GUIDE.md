# Photo editor tool guide

Use this guide when adding or changing a non-destructive photo-editor tool. The goal is a tool that feels immediate, keeps its recipe portable, renders consistently in preview and export, and cannot take down the rest of the editor.

## Fast path

1. Run `pnpm.cmd run photo-tool:new -- <kebab-case-name>` to create the isolated tool directory.
2. Define the persisted operation values and defaults in that plug-in.
3. Build the exact renderer and a matching interactive preview where practical.
4. Add settings, canvas controls, reset behaviour, and safe automatic assistance.
5. Wire the sidebar, preview, renderer, tests, and error boundary.
6. Run the relevant core, UI, and repository wiring checks.

## File and folder structure

Use the existing tool shape. Add only the files that the tool needs.

| Concern | Location | Purpose |
| --- | --- | --- |
| Persisted operation contract | `src/boundary/contracts/photoEditor.ts` | Add the `PhotoEditTool` value and typed recipe fields where needed. Recipes must remain serializable numbers and booleans. |
| Plug-in manifest and defaults | `src/services/photoEditing/tools/plugins/<tool>/` | The one authoritative tool directory: typed plug-in, defaults, implementation, fixtures and tests. |
| Generated registry | `src/services/photoEditing/generatedPhotoEditToolPluginRegistry.ts` | Machine-owned output. Run `photo-tool:generate-registry`; never edit it. |
| Exact pixel or image algorithm | `src/shared/photoEditing/<tool>.ts` | Keep deterministic, testable algorithms here. This is the source of truth for full-resolution rendering. |
| Renderer integration | `src/services/photoEditing/editRenderer.ts` | Apply the operation in edit-stack order for both preview and final render. |
| Settings UI | `src/ui/components/photo-editor/Photo<Tool>Options.tsx` | Tool-specific controls, presets, reset, and per-tool auto action. |
| Canvas interaction | `src/ui/components/photo-editor/Photo<Tool>Overlay.tsx` | Optional fitted-canvas controls such as points, guides, handles, or picked colours. |
| Geometry and value helpers | `src/ui/components/photo-editor/<tool>Geometry.ts` or `src/shared/photoEditing/<tool>.ts` | Keep coordinate conversion, clamping, and value derivation pure and separately tested. |
| Preview dispatch | `src/ui/components/photo-editor/PhotoEditorPreview.tsx` | Mount the overlay inside the selected-tool preview region. |
| Settings dispatch | `src/ui/components/photo-editor/PhotoEditorSidebar.tsx` | Route the selected operation to the settings component and use the shared automatic-analysis hook where appropriate. |
| Automatic suggestions | `src/shared/photoEditing/automatic.ts`, `src/ui/components/photo-editor/photoAutomatic.ts` | Add conservative photo-level suggestions only when the tool has a safe, useful recommendation. |
| Tests | `tests/core/photo-edit-*.test.cjs`, `tests/ui/photo-editor-*.test.cjs`, `tests/repo/photo-editor-wiring.test.mjs` | Cover pixels/recipes, UI wiring, and required registration points. |

Do not create a separate side channel for a tool. Its persisted recipe belongs in the normal `PhotoEditOperation` stack, so it appears in Layers & changes, works with styles and masks where applicable, and can be disabled, reordered, or deleted like every other edit. The host owns transport, sequencing, masks and local error containment; a plug-in owns identity, defaults, validation, controls, overlays, preview, rendering and help. `grayscale` is migrated; the other eleven tools remain on the compatibility adapter until Prompt 10.

## Main entry points and data flow

`PhotoEditorWorkspace.tsx` owns document loading, draft/history state, preview requests, save, and render. Tools express intent through the selected `PhotoEditOperation`; they do not own a second source of truth.

```text
Tool tile → operation defaults → selected operation
                    ↓                    ↓
             sidebar settings ←→ canvas overlay (draft updates)
                    ↓                    ↓
             history commit → preview queue → shared renderer → final render
```

- Register the tool in `photoEditorTools.ts`; use its defaults to create a normal operation.
- In settings and overlays, call `onPreviewChange` for responsive draft feedback and `onCommit` when a gesture or control change is complete. Keep expensive exact preview work behind the existing latest-only preview queue.
- Put interactive overlays in `PhotoEditorPreview.tsx` and use normalized image coordinates. Do not store viewport pixels in a recipe.
- Add the full-resolution implementation in `editRenderer.ts`. Preview and export must share the same operation semantics and stack order.
- Add the settings route in `PhotoEditorSidebar.tsx`. Selected controls are automatically contained by `PhotoEditorToolBoundary`; do not bypass it.

## Settings and interaction standards

### Controls

- Present scalar adjustments as percentages whenever the user thinks in relative strength, amount, or blend. Convert between display percentages and persisted values in pure helpers.
- Use a visual control when it communicates the result better than a number: a gradient track for hue, a small guide diagram for crop ratios, a palette for colours, or a canvas handle for a focal point.
- Prefer direct canvas manipulation for position, angle, region, size, falloff, colour picking, and similar spatial controls. Sliders remain useful for precise magnitude.
- Keep controls accessible: native inputs and buttons, visible keyboard focus, labels, and pointer-independent ways to reach every setting.
- Use the shared primitives and semantic theme classes. Do not add static inline styles or ad hoc feedback UI.

### Reset and auto

- Provide a per-setting reset where the setting is independently meaningful. Place it at the top-right of that setting row, matching the Tune image pattern.
- Provide a visible `Reset tool` action that restores all tool defaults and clears transient canvas state such as picked points or guides. It must not affect other operations.
- Add an `Auto` action only when there is a deterministic, explainable, useful result. Examples: Rotate can straighten confident near-horizontal or near-vertical lines; Focus can place points on persisted face boxes; Crop can use persisted frame or subject/region metadata.
- Auto must be safe to revise: show the result in the normal controls/canvas, use non-destructive operation values, and leave the user able to reset or adjust it.
- If a tool has a conservative whole-photo recommendation, add it through `automatic.ts` and `photoAutomatic.ts`. It should be reviewable in the `Automatic` tool, selected by default only because every offered suggestion is considered applicable, and represented as normal items in Layers & changes.
- Do not force a suggestion merely to make a tool participate in Automatic. Omit it when the evidence is weak or the effect is creative rather than corrective.

## Reliability, feedback, and AI

- Every tool preview and controls panel must remain inside `PhotoEditorToolBoundary`. A tool error must render local retry feedback and leave the editor shell, history, masks, and unsaved stack available.
- Keep short deterministic analysis on the client or in the regular preview/render path. Do not block the UI thread.
- For long-running work—local model inference, external model/API calls, batch processing, or any operation that needs progress—create a workflow under `src/services/workflowRuntime/workflows/` and compose it from modules under `src/services/workflowRuntime/modules/`.
- Use the project workflow/job event wiring and shared feedback framework (`tracked` for multi-step work, `inline` for a slower single-item flow, `transient` for short notices). Do not add a tool-specific polling loop, status string, or toast system.
- Clearly label when AI is used. If an action sends an image, metadata, or any photo-derived data outside local storage, warn before the action starts: name the external service or destination, state what data leaves the device and why, and require an explicit user confirmation. Never silently fall back from local processing to an external request.
- Local AI should still be labelled as AI, but distinguish it from external processing so users know their data remains on-device.

## Completion checklist

- [ ] A normal non-destructive operation can be created, selected, reordered, disabled, deleted, saved, and rendered.
- [ ] Preview and final render use the same algorithm and stack order.
- [ ] Settings use understandable units, visual controls where useful, per-setting reset, and reset-tool behaviour.
- [ ] Spatial values can be adjusted on the canvas when that is more natural than entering numbers.
- [ ] Any automatic result is conservative, explainable, editable, and integrated with the Automatic tool only when useful.
- [ ] Tool UI remains protected by `PhotoEditorToolBoundary`.
- [ ] Long-running or AI work uses the standard workflow and feedback mechanisms.
- [ ] External-AI egress is clearly disclosed and explicitly confirmed before data leaves local storage.
- [ ] Core algorithm, UI wiring, renderer, and repository checks cover the new integration points.
