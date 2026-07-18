import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { loadColourPopImage } from "./colourPopImage";
import type { ColourPopImage } from "./colourPopImage";

export type CanvasSize = { height: number; width: number };

export function usePhotoEditorContainerSize(
  rootRef: RefObject<HTMLDivElement | null>,
): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({ height: 1, width: 1 });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }
    const update = () => setSize({ height: root.clientHeight, width: root.clientWidth });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);
  return size;
}

export function fittedPhotoEditorSize(
  container: CanvasSize,
  image: CanvasSize | null,
): CanvasSize {
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

export function usePhotoEditorSourceImage(
  sourceUrl: string | null,
): ColourPopImage | null {
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
