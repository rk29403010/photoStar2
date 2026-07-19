import { useEffect, useMemo, useRef } from "react";
import type { PhotoEditOperation } from "@contracts/core";
import { applyTuneImagePixels } from "@shared/photoEditing/tune";
import type { ColourPopImage } from "./colourPopImage";
import {
  fittedPhotoEditorSize,
  usePhotoEditorContainerSize,
  usePhotoEditorSourceImage,
} from "./photoEditorCanvasImage";

function TuneCanvas(props: {
  readonly operation: PhotoEditOperation;
  readonly showWithoutChange: boolean;
  readonly source: ColourPopImage;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    canvas.width = props.source.width;
    canvas.height = props.source.height;
    const frame = context.createImageData(props.source.width, props.source.height);
    frame.data.set(props.showWithoutChange
      ? props.source.data
      : applyTuneImagePixels(props.source.data, props.operation.values));
    context.putImageData(frame, 0, 0);
  }, [props.operation.values, props.showWithoutChange, props.source]);
  return <canvas ref={canvasRef} className="h-full w-full" />;
}

export function PhotoTuneOverlay(props: {
  readonly operation: PhotoEditOperation;
  readonly previewUrl: string | null;
  readonly showWithoutChange: boolean;
  readonly sourceUrl: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const source = usePhotoEditorSourceImage(props.sourceUrl);
  const container = usePhotoEditorContainerSize(rootRef);
  const stage = useMemo(() => fittedPhotoEditorSize(container, source), [container, source]);
  let preview = null;
  if (source) {
    preview = <div className="overflow-hidden shadow-xl" style={{ height: stage.height, width: stage.width }}><TuneCanvas operation={props.operation} showWithoutChange={props.showWithoutChange} source={source} /></div>;
  } else if (props.previewUrl) {
    preview = <img className="max-h-full max-w-full object-contain" src={props.previewUrl} alt="Edit preview" />;
  }
  return (
    <div ref={rootRef} className="relative flex h-full w-full items-center justify-center overflow-hidden p-8">
      {preview}
    </div>
  );
}
