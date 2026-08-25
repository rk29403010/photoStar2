# Perception

Experimental perceptual rendering tool.

The deterministic renderer is deliberately recipe-based and mask-compatible:

- local luminance adaptation approximates the way visual adaptation changes across a scene;
- `Emphasis` increases local detail/chroma in a selected region;
- `Suppression` reduces local contrast/chroma so incidental objects recede;
- `Colour constancy` applies a restrained grey-world correction.

A whole-image Perception operation should normally leave `Emphasis` and `Suppression` at zero. Add or select a mask when using either control locally.

`generative.ts` defines the prompt boundary for explicit `remove`/`simplify` actions. It is intentionally not called from normal recipe rendering. Generative reconstruction should be a separate user action with a supplied mask, then validated for changes outside that mask before the returned pixels are accepted.

This prototype is registered explicitly rather than through the generated plug-in manifest registry so that the generated registries remain reproducible while the interaction is still experimental.
