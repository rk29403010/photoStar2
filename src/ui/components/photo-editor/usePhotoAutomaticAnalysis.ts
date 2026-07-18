import { useEffect, useMemo, useState } from "react";
import type { Asset } from "@contracts/core";
import { analyzePhotoPixels } from "@shared/photoEditing/automatic";
import type { AutomaticPhotoAnalysis } from "@shared/photoEditing/automatic";
import { loadColourPopImage } from "./colourPopImage";
import { automaticContextFromAsset } from "./photoAutomatic";

export type PhotoAutomaticAnalysisState = {
  analysis: AutomaticPhotoAnalysis | null;
  error: string | null;
  status: "idle" | "loading" | "ready" | "unavailable";
};

export function usePhotoAutomaticAnalysis(
  sourceUrl: string | null,
  asset: Asset,
  semanticGeometrySafe = true,
): PhotoAutomaticAnalysisState {
  const context = useMemo(() => {
    const assetContext = automaticContextFromAsset(asset);
    return semanticGeometrySafe
      ? assetContext
      : { ...assetContext, attentionBoxes: [], faceBoxes: [], frameBox: null };
  }, [asset, semanticGeometrySafe]);
  const [state, setState] = useState<PhotoAutomaticAnalysisState>({
    analysis: null,
    error: null,
    status: "idle",
  });
  useEffect(() => {
    let active = true;
    if (!sourceUrl) {
      setState({ analysis: null, error: null, status: "idle" });
      return () => { active = false; };
    }
    setState({ analysis: null, error: null, status: "loading" });
    void loadColourPopImage(sourceUrl, 360)
      .then((image) => {
        if (!active) {
          return;
        }
        const analysis = analyzePhotoPixels(image.data, image.width, image.height, context);
        setState({ analysis, error: null, status: "ready" });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setState({
          analysis: null,
          error: error instanceof Error ? error.message : "Photo analysis is unavailable.",
          status: "unavailable",
        });
      });
    return () => { active = false; };
  }, [context, sourceUrl]);
  return state;
}
