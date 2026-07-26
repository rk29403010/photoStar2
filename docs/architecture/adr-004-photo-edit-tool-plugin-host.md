# ADR-004: Deterministic photo-editing tool plug-in host

## Decision

Photo-editing tools are self-contained plug-ins beneath
`src/services/photoEditing/tools/plugins/<tool>/`. Their `manifest.ts` inputs
produce a sorted static registry. This avoids fragile runtime discovery in Vite,
Node core, Tauri development, and packaged desktop builds. The host dispatches
through the contract and retains image decoding, encoding, sequencing, masks,
transport, unavailable-recipe handling and error containment.

## Resilience

All known tools register only through the generated registry; compatibility
adapters and flat catalogues are not extension points. Unknown recipe IDs and
their version metadata are retained and rendered as unavailable rather than
removed or reinterpreted.
