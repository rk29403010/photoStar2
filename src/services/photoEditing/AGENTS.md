# Photo Editing Guardrails

These rules apply under `src/services/photoEditing/` in addition to the root
`AGENTS.md`.

- Photo editing is non-destructive. Source assets are never modified in place;
  edits are ordered recipes/rendered derivatives with preserved lineage.
- Each editing tool is a self-contained plug-in behind the shared tool contract.
  Tool-specific defaults, validation, controls/overlay, preview/render behavior,
  help, automatic suggestions, and geometry safety belong with that plug-in.
- The editor/renderer host owns generic transport, sequencing, masks, error
  containment, and unavailable-operation presentation. Do not add tool-ID
  branches or hand-maintained catalogues to hosts.
- The generated photo-edit tool registry is machine-owned. Change manifests or
  the generator, then run the registry generator/check; never hand-edit generated
  registry output.
- Saved styles are database data, not generated source plug-ins. Persisted unknown
  or unavailable operations remain visible and verbatim rather than being lost.
- Generative restoration must preserve identity-critical detail and keep uncertain
  reconstruction explicit. Text, inscriptions, faces, badges, and similar
  evidence require conservative handling rather than plausible invention.
- Keep browser preview and final-render semantics aligned. If an operation cannot
  safely share semantics, make the difference explicit and tested.

Start substantial tool work with `docs/ai/PHOTO_EDITOR_TOOL_GUIDE.md` when that
file is relevant to the requested change.
