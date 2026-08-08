# Segmentation providers

`src/services/segmentation` contains model-neutral image preparation, normalized prompts, alpha masks and deterministic resource ownership. Functional modules consume those outputs; they do not inspect ONNX tensors.

`fastsam` is the available fast fallback. `efficientsam` uses the official EfficientSAM-Ti split encoder/decoder ONNX export at upstream commit `d525f622e6f640acf5a0fc37c7ca1f243da5bde0`; it is selected by `auto` for the accurate profile only when both declared deployment assets exist. Ordinary inference never downloads a model.

Install EfficientSAM assets explicitly with `pnpm.cmd run download:efficientsam`. The installer pins reviewed SHA-256 hashes and writes into `deployments/common/models`, which is already included in desktop packaging and snapshot path resolution. EfficientSAM is attributed to [yformer/EfficientSAM](https://github.com/yformer/EfficientSAM), Apache-2.0.
