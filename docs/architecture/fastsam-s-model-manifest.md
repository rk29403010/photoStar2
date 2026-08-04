# FastSAM-s FP32 model manifest

- Model: FastSAM-s from the official `CASIA-LMC-Lab/FastSAM` repository, retrieved 2026-08-04.
- Official checkpoint: Google Drive file `10XmSj6mmpmRb8NhXbtiuO9cTTBwR_9SV`, named `FastSAM-s.pt`.
- Checkpoint SHA-256: `e9034d7478a8e9d1bfb57b51592e521a253287c7cdcf79258f61ea6d68584a0d`. This is a PhotoStar-observed hash, not an upstream-published checksum.
- Export: `fastsam-s-fp32.onnx`, SHA-256 `fb28dd555a5e77dd0d60b48734a8b3f294883351bf0f3cb53a08e7cd9948abec`; FP32, fixed RGB `1024x1024`, letterbox fill `(114,114,114)`, ONNX opset 12, no simplification, no embedded NMS.
- Toolchain: Python 3.12.10, PyTorch 2.13.0 CPU, Ultralytics 8.3.0, ONNX 1.16.2, ONNX Runtime 1.19.2, onnxscript 0.1.0, onnx-ir 0.1.13.
- Graph: `images [1,3,1024,1024]`; detection `output0 [1,37,21504]`; prototype `467 [1,32,256,256]`. Auxiliary exporter outputs are ignored.

## Licence

The FastSAM repository is AGPL-3.0 while its README states the weights are Apache-2.0. PhotoStar copies no FastSAM or Ultralytics code: Ultralytics is an external export tool and the runtime post-processing is independent TypeScript. Human legal review remains required to confirm that the stated weights licence covers redistribution of this derived ONNX export.

## Verification

On upstream `images/dogs.jpg`, the PyTorch reference returned 16 candidates at `conf=0.4`, `iou=0.9`; the raw ONNX graph plus reference NMS returned 22; PhotoStar currently retained 25 before functional filtering. High-confidence boxes align, but candidate-count parity is not yet within a defined tolerance and is not claimed. A cold CPU run measured 79.5 ms preprocessing, 448.8 ms session load, and 2043.9 ms execution plus post-processing. INT8 is deferred.
