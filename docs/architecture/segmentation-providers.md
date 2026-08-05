# Segmentation providers

Functional workflow modules (`runtime.detect_frame` and `runtime.segment_objects`) consume a shared provider-neutral contract: prepared image, normalized prompts, alpha mask, normalized box, optional score, and explicit disposal. Providers own model tensors and model availability; workflows never inspect ONNX outputs.

Ingest uses tiers: deterministic border work first, bounded FastSAM masks after previews, then conditional deeper frame work. EfficientSAM is on-demand only. Masks are stored as source-scoped `asset_mask_metadata` PNG alpha rasters with normalized boxes, capped count and capped raster dimensions; their provider-qualified references are exposed unchanged to the editor.

`auto` resolves by profile and installed models. Prepared embeddings live only for the request and are disposed deterministically. Missing or incompatible models produce typed provider failures, not empty successful results.

Future providers map into the same contract without changing workflows: MediaPipe Interactive Segmenter/MagicTouch (interactive local/browser point prompts); MediaPipe Selfie/Multiclass (fast local semantic regions); SAM 3, SAM 2.1/EfficientTAM (on-demand sidecar prompts); Grounding DINO plus SAM and YOLO segmentation (known-class local/sidecar proposals); and alpha-matting refinement (on-demand edge refinement). Each requires model, export, licensing and runtime verification before adoption; remote runtimes require explicit egress consent.
