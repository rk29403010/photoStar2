"""Explicit, local-only FastSAM-s FP32 export. Do not invoke from application inference."""
import hashlib
import pathlib
import shutil
import sys

CHECKPOINT_SHA256 = "e9034d7478a8e9d1bfb57b51592e521a253287c7cdcf79258f61ea6d68584a0d"
OUTPUT_SHA256 = "fb28dd555a5e77dd0d60b48734a8b3f294883351bf0f3cb53a08e7cd9948abec"

def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: export_fastsam_s_model.py <FastSAM-s.pt> <deployment-model-dir>")
    checkpoint = pathlib.Path(sys.argv[1]).resolve()
    destination = pathlib.Path(sys.argv[2]).resolve() / "fastsam-s-fp32.onnx"
    if digest(checkpoint) != CHECKPOINT_SHA256:
        raise SystemExit("FastSAM-s checkpoint checksum mismatch")
    from ultralytics import FastSAM
    import torch
    model = FastSAM(str(checkpoint)).model.fuse().eval()
    sample = torch.zeros((1, 3, 1024, 1024))
    temporary = destination.with_suffix(".onnx.part")
    torch.onnx.export(model, sample, temporary, opset_version=12, do_constant_folding=True, input_names=["images"], output_names=["output0", "output1"], dynamic_axes=None, dynamo=False)
    if digest(temporary) != OUTPUT_SHA256:
        temporary.unlink(missing_ok=True)
        raise SystemExit("FastSAM-s ONNX checksum differs from the pinned controlled export")
    import onnx
    import onnxruntime as ort
    onnx.checker.check_model(str(temporary))
    session = ort.InferenceSession(str(temporary), providers=["CPUExecutionProvider"])
    if session.get_inputs()[0].name != "images" or tuple(session.get_inputs()[0].shape) != (1, 3, 1024, 1024):
        raise SystemExit("FastSAM-s ONNX input contract is incompatible")
    if not any(tuple(output.shape) == (1, 37, 21504) for output in session.get_outputs()):
        raise SystemExit("FastSAM-s ONNX detection output is incompatible")
    if not any(tuple(output.shape) == (1, 32, 256, 256) for output in session.get_outputs()):
        raise SystemExit("FastSAM-s ONNX prototype output is incompatible")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(temporary, destination)

if __name__ == "__main__":
    main()
