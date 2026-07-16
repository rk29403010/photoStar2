import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from "react";
import type { PhotoEditOperation } from "@contracts/core";
import {
  MAX_COLOUR_POP_COLOURS,
  applyColourPopPixels,
  colourDistance,
  readColourPopColours,
  rgbCss,
  writeColourPopColours,
} from "@shared/photoEditing/colourPop";
import type { RgbColour } from "@shared/photoEditing/colourPop";
import { loadColourPopImage } from "./colourPopImage";
import type { ColourPopImage } from "./colourPopImage";

type Size = { height: number; width: number };
type PickMarker = { colour: RgbColour; x: number; y: number };

function useContainerSize(rootRef: RefObject<HTMLDivElement | null>): Size {
  const [size, setSize] = useState<Size>({ height: 1, width: 1 });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }
    const update = () =>
      setSize({ height: root.clientHeight, width: root.clientWidth });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);
  return size;
}

function fittedSize(container: Size, image: Size | null): Size {
  if (!image) {
    return { height: 0, width: 0 };
  }
  const scale = Math.min(
    Math.max(0, container.width - 64) / image.width,
    Math.max(0, container.height - 64) / image.height,
    1,
  );
  return { height: image.height * scale, width: image.width * scale };
}

function useSourceImage(sourceUrl: string | null): ColourPopImage | null {
  const [image, setImage] = useState<ColourPopImage | null>(null);
  useEffect(() => {
    let active = true;
    setImage(null);
    if (sourceUrl) {
      void loadColourPopImage(sourceUrl, 900)
        .then((loaded) => {
          if (active) {
            setImage(loaded);
          }
        })
        .catch(() => {
          if (active) {
            setImage(null);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [sourceUrl]);
  return image;
}

function markerStyle(marker: PickMarker): CSSProperties {
  return {
    backgroundColor: rgbCss(marker.colour),
    left: `${marker.x * 100}%`,
    top: `${marker.y * 100}%`,
  };
}

function pickedPoint(event: ReactMouseEvent<HTMLButtonElement>): {
  x: number;
  y: number;
} {
  if (event.detail === 0) {
    return { x: 0.5, y: 0.5 };
  }
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function colourAt(
  image: ColourPopImage,
  point: { x: number; y: number },
): RgbColour {
  const x = Math.min(image.width - 1, Math.floor(point.x * image.width));
  const y = Math.min(image.height - 1, Math.floor(point.y * image.height));
  const offset = (y * image.width + x) * 4;
  return {
    red: image.data[offset],
    green: image.data[offset + 1],
    blue: image.data[offset + 2],
  };
}

function appendColour(selected: RgbColour[], colour: RgbColour): RgbColour[] {
  if (selected.some((candidate) => colourDistance(candidate, colour) < 4)) {
    return selected;
  }
  return selected.length < MAX_COLOUR_POP_COLOURS
    ? [...selected, colour]
    : selected;
}

function ColourPopCanvas(props: {
  readonly marker: PickMarker | null;
  readonly operation: PhotoEditOperation;
  readonly showWithoutChange: boolean;
  readonly source: ColourPopImage;
  readonly stage: Size;
  readonly onChange: (operation: PhotoEditOperation) => void;
  readonly onMarkerChange: (marker: PickMarker) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const source = props.source;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.width = props.source.width;
    canvas.height = props.source.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const output = props.showWithoutChange
      ? props.source.data
      : applyColourPopPixels(props.source.data, props.operation.values);
    const frame = context.createImageData(
      props.source.width,
      props.source.height,
    );
    frame.data.set(output);
    context.putImageData(frame, 0, 0);
  }, [props.operation.values, props.showWithoutChange, props.source]);

  const pick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const point = pickedPoint(event);
    const colour = colourAt(source, point);
    const selected = readColourPopColours(props.operation.values);
    const colours = appendColour(selected, colour);
    props.onMarkerChange({ ...point, colour });
    if (colours !== selected) {
      props.onChange({
        ...props.operation,
        values: writeColourPopColours(props.operation.values, colours),
      });
    }
  };

  return (
    <button
      type="button"
      aria-label="Pick a colour from the photo to keep; keyboard activation picks the centre colour"
      className="relative cursor-crosshair bg-transparent p-0 shadow-xl hover:ring-2 hover:ring-brand-accent/70 focus-visible:ring-2 focus-visible:ring-brand-accent"
      disabled={props.showWithoutChange}
      style={{ height: props.stage.height, width: props.stage.width }}
      onClick={pick}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      {!props.showWithoutChange && props.marker && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm"
          style={markerStyle(props.marker)}
        />
      )}
    </button>
  );
}

function PreviewFallback(props: { readonly previewUrl: string | null }) {
  if (!props.previewUrl) {
    return null;
  }
  return (
    <img
      className="max-h-full max-w-full object-contain"
      src={props.previewUrl}
      alt="Edit preview"
    />
  );
}

export function PhotoColourPopOverlay(props: {
  readonly operation: PhotoEditOperation;
  readonly previewUrl: string | null;
  readonly showWithoutChange: boolean;
  readonly sourceUrl: string | null;
  readonly onChange: (operation: PhotoEditOperation) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [marker, setMarker] = useState<PickMarker | null>(null);
  const source = useSourceImage(props.sourceUrl);
  const container = useContainerSize(rootRef);
  const stage = useMemo(
    () => fittedSize(container, source),
    [container, source],
  );
  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden p-8"
    >
      {source ? (
        <ColourPopCanvas
          marker={marker}
          operation={props.operation}
          showWithoutChange={props.showWithoutChange}
          source={source}
          stage={stage}
          onChange={props.onChange}
          onMarkerChange={setMarker}
        />
      ) : (
        <PreviewFallback previewUrl={props.previewUrl} />
      )}
      {!props.showWithoutChange && (
        <p className="pointer-events-none absolute bottom-4 rounded bg-surface/90 px-2 py-1 text-xs text-content shadow-sm">
          Click a colour to keep it
        </p>
      )}
    </div>
  );
}
