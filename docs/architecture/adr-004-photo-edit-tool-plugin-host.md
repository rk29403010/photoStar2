# ADR-004: Deterministic photo-editing tool plug-in host

## Decision

Photo-editing tools are self-contained plug-ins beneath
`src/services/photoEditing/tools/plugins/<tool>/`. Their `manifest.ts` inputs
produce a sorted static registry. This avoids fragile runtime discovery in Vite,
Node core, Tauri development, and packaged desktop builds. The host dispatches
through the contract and retains image decoding, encoding, sequencing, masks,
transport, unavailable-recipe handling and error containment.

## Compatibility

Generated plug-ins register before legacy adapters. `grayscale` is migrated in
this change; eleven existing tools remain legacy-compatible until Prompt 10.
Unknown recipe IDs are retained and rendered as unavailable rather than removed
or reinterpreted.
