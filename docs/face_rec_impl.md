# Face Recognition Implementation Details

## Pipeline Steps
1.  **Detection**: Locate faces (Bounding Box + 5 Landmarks).
    -   *Current*: RFB-320 (Boxes only, no landmarks).
    -   *Target*: RetinaFace (mnet or R50) or Buffalo_S/L (InsightFace).
    -   *Requirement*: Must assume new model input/output structure to get landmarks.
2.  **Alignment**: affine transform to align eyes/nose/mouth to standard template.
    -   Standard template: ArcFace 112x112 references.
    -   Tool: `sharp` (affine) or custom JS matrix logic.
3.  **Embedding**: Forward pass through ArcFace.
    -   Input: 112x112 RGB image (normalized -1..1 or 0..1 depending on model).
    -   Output: 512-float vector.
4.  **Storage**:
    -   Save vector to `derived_results`.
    -   Format: JSON array or Float32Array blob (Blob preferred for DB performance, JSON for prototype).

## Model Specifications

### Detection (RetinaFace)
-   **Input**: `1 x 3 x H x W` (BGR, not normalized, or pixel - mean).
-   **Output**: 
    -   `loc`: Bounding box deltas.
    -   `conf`: Scores.
    -   `land`: 5 landmarks (Right Eye, Left Eye, Nose, Right Mouth, Left Mouth).

### Recognition (ArcFace / MobileFaceNet)
-   **Input**: `1 x 3 x 112 x 112` (BGR or RGB).
    -   Normalization: `(pixel - 127.5) / 128.0`.
-   **Output**: `1 x 512` embedding.

## DB Schema Update
Add `embedding` column or use `derived_results`.
-   `derived_results` table exists.
    -   `task`: 'face_embedding'
    -   `data`: `{ vector: [...] }`

## Missing Assets
We need the ONNX files for:
1.  **RetinaFace** (with landmarks). `version-RFB-320.onnx` might not have landmarks output enabled/trained.
2.  **ArcFace**.

## Proposed Action
1.  Implement alignment logic (using standard ArcFace reference points).
2.  Implement `generate_embeddings` job.
3.  Update logic to look for `retinaface_mnet025.onnx` (or similar) and `w600k_r50.onnx` (ArcFace).
