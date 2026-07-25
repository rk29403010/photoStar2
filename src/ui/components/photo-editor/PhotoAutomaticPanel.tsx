import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Asset, PhotoEditOperation } from "@contracts/core";
import type { AutomaticPhotoAnalysis } from "@shared/photoEditing/automatic";
import { Button, Checkbox } from "../Primitives";
import { InlineFeedback } from "../feedback/InlineFeedback";
import {
  buildPhotoAutomaticSuggestions,
  mergeAutomaticSuggestions,
} from "./photoAutomatic";
import type { PhotoAutomaticSuggestion } from "./photoAutomatic";
import { usePhotoAutomaticAnalysis } from "./usePhotoAutomaticAnalysis";
import { getPhotoEditToolPlugin } from "./photoEditorTools";

type PhotoAutomaticPanelProps = {
  readonly asset: Asset;
  readonly operations: PhotoEditOperation[];
  readonly sourceUrl: string | null;
  readonly onApply: (operations: PhotoEditOperation[]) => void;
};

const SCENE_LABELS = {
  framed: "Framed photo",
  general: "General photo",
  group: "Group portrait",
  landscape: "Landscape",
  portrait: "Portrait",
} as const;

function ReadyAutomaticPanel(props: {
  readonly analysis: AutomaticPhotoAnalysis;
  readonly operations: PhotoEditOperation[];
  readonly suggestions: PhotoAutomaticSuggestion[];
  readonly onApply: (operations: PhotoEditOperation[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelectedIds(new Set(props.suggestions.map((suggestion) => suggestion.id)));
  }, [props.suggestions]);
  const selected = props.suggestions.filter((suggestion) => selectedIds.has(suggestion.id));
  const toggle = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
  const apply = () => props.onApply(mergeAutomaticSuggestions(props.operations, selected));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-content">
        <Sparkles aria-hidden="true" className="text-brand-accent" size={18} />
        <span className="font-semibold">{SCENE_LABELS[props.analysis.scene]}</span>
      </div>
      <p className="text-xs text-content-secondary">
        Review the measured corrections before applying them.
      </p>
      <div className="divide-y divide-content/10 rounded-md border border-content/10 bg-surface-secondary">
        {props.suggestions.map((suggestion) => (
          <div key={suggestion.id} className="flex gap-3 p-3 hover:bg-surface focus-within:bg-surface">
            <Checkbox
              id={`automatic-suggestion-${suggestion.id}`}
              checked={selectedIds.has(suggestion.id)}
              onChange={() => toggle(suggestion.id)}
            />
            <label
              htmlFor={`automatic-suggestion-${suggestion.id}`}
              className="min-h-12 min-w-0 flex-1 cursor-pointer text-left"
            >
              <span className="block text-sm font-medium text-content">{suggestion.label}</span>
              <span className="mt-1 block text-xs leading-5 text-content-secondary">
                {suggestion.rationale}
              </span>
            </label>
          </div>
        ))}
      </div>
      <Button
        className="w-full focus-visible:ring-2 focus-visible:ring-brand-accent"
        disabled={selected.length === 0}
        onClick={apply}
      >
        Apply {selected.length} {selected.length === 1 ? "suggestion" : "suggestions"}
      </Button>
      <InlineFeedback
        mode="inline"
        message="Automatic edits are non-destructive. Each selected correction appears in Layers & changes, where you can turn it off or delete it. EXIF orientation is already corrected before analysis."
      />
    </div>
  );
}

export function PhotoAutomaticPanel(props: PhotoAutomaticPanelProps) {
  const semanticGeometrySafe = !props.operations.some((operation) =>
    operation.enabled && getPhotoEditToolPlugin(operation.tool)?.capabilities?.geometryChanges,
  );
  const automatic = usePhotoAutomaticAnalysis(props.sourceUrl, props.asset, semanticGeometrySafe);
  const suggestions = useMemo(
    () => automatic.analysis
      ? buildPhotoAutomaticSuggestions(props.asset, automatic.analysis, semanticGeometrySafe)
      : [],
    [automatic.analysis, props.asset, semanticGeometrySafe],
  );
  if (automatic.status === "loading" || automatic.status === "idle") {
    return <InlineFeedback mode="inline" state="pending" message="Reading light, colour, lines, and known subjects…" />;
  }
  if (!automatic.analysis || automatic.status === "unavailable") {
    return <InlineFeedback mode="inline" state="error" message={automatic.error ?? "Automatic suggestions are unavailable."} />;
  }
  if (suggestions.length === 0) {
    return <InlineFeedback mode="inline" message="This photo already looks balanced; no confident corrective changes were found." />;
  }
  return (
    <ReadyAutomaticPanel
      analysis={automatic.analysis}
      operations={props.operations}
      suggestions={suggestions}
      onApply={props.onApply}
    />
  );
}
