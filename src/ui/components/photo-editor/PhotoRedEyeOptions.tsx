import { useEffect, useRef, useState } from "react";
import type { Asset, PhotoEditOperation } from "@contracts/core";
import { RED_EYE_DEFAULTS, RED_EYE_MODE, detectRedEyePoints, readRedEyePoints, writeRedEyePoints } from "@shared/photoEditing/redEye";
import { Button, Select } from "../Primitives";
import { loadColourPopImage } from "./colourPopImage";

type Props = {
  readonly asset: Asset;
  readonly operation: PhotoEditOperation;
  readonly sourceUrl: string | null;
  readonly onCommit: (operation: PhotoEditOperation) => void;
  readonly onPreviewChange: (operation: PhotoEditOperation) => void;
};

function mode(values: PhotoEditOperation["values"]): number {
  return Math.round(typeof values.mode === "number" ? values.mode : RED_EYE_MODE.human);
}

export function PhotoRedEyeOptions(props: Props) {
  const [detecting, setDetecting] = useState(false);
  const draftRef = useRef(props.operation);
  useEffect(() => { draftRef.current = props.operation; }, [props.operation]);
  const update = (values: PhotoEditOperation["values"]) => {
    const next = { ...draftRef.current, values };
    draftRef.current = next;
    props.onPreviewChange(next);
    props.onCommit(next);
  };
  const detect = async () => {
    if (!props.sourceUrl) { return; }
    setDetecting(true);
    try {
      const image = await loadColourPopImage(props.sourceUrl, 900);
      const boxes = (props.asset.faces ?? []).map((face) => face.box);
      const points = detectRedEyePoints(image.data, image.width, image.height, boxes, draftRef.current.values);
      update(writeRedEyePoints(draftRef.current.values, points));
    } finally { setDetecting(false); }
  };
  const pointCount = readRedEyePoints(props.operation.values).length;
  const eyeTypeId = `${props.operation.id}-red-eye-mode`;
  return (
    <div className="space-y-4">
      <p className="text-sm text-content-secondary">Scans detected face areas for flash reflections. Click the photo to add or move a correction point.</p>
      <label htmlFor={eyeTypeId} className="flex flex-col gap-1 text-xs text-content-secondary">
        Eye type
        <Select id={eyeTypeId} value={mode(props.operation.values)} onChange={(event) => update({ ...draftRef.current.values, mode: Number(event.target.value) })}>
          <option value={RED_EYE_MODE.human}>Human red eye</option>
          <option value={RED_EYE_MODE.pet}>Pet eye shine</option>
        </Select>
      </label>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-content-secondary"><label htmlFor={`${props.operation.id}-red-eye-strength`}>Correction strength</label><output>{Math.round((typeof props.operation.values.strength === "number" ? props.operation.values.strength : 1) * 100)}%</output></div>
        <input id={`${props.operation.id}-red-eye-strength`} className="w-full accent-brand-accent" type="range" min="0" max="1" step="0.01" value={typeof props.operation.values.strength === "number" ? props.operation.values.strength : 1} onChange={() => undefined} onInput={(event) => { const next = { ...draftRef.current, values: { ...draftRef.current.values, strength: Number(event.currentTarget.value) } }; draftRef.current = next; props.onPreviewChange(next); }} onPointerUp={() => props.onCommit(draftRef.current)} onKeyUp={() => props.onCommit(draftRef.current)} />
      </div>
      <Button className="w-full" variant="secondary" disabled={detecting || !props.sourceUrl || props.asset.faces?.length === 0} onClick={() => void detect()}>{detecting ? "Scanning eyes…" : "Detect in faces"}</Button>
      <p className="text-xs text-content-secondary">{pointCount === 0 ? "No correction points yet." : `${pointCount} ${pointCount === 1 ? "eye point" : "eye points"} ready to review.`} Pet placement is manual when no human face is detected.</p>
      <Button className="w-full" variant="secondary" onClick={() => update(RED_EYE_DEFAULTS)}>Reset tool</Button>
    </div>
  );
}
