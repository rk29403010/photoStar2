import type { ReactNode } from "react";
import { PhotoColourPopOverlay } from "./PhotoColourPopOverlay";
import { PhotoCropOverlay } from "./PhotoCropOverlay";
import { PhotoEditorToolBoundary } from "./PhotoEditorToolBoundary";
import { PhotoEffectsOverlay } from "./PhotoEffectsOverlay";
import { PhotoFocusOverlay } from "./PhotoFocusOverlay";
import { PhotoMaskOverlay } from "./PhotoMaskOverlay";
import { PhotoRotateOverlay } from "./PhotoRotateOverlay";
import { getLivePreviewStyle } from "./photoEditLivePreview";
import type { EditorViewProps } from "./PhotoEditorWorkspace";

type ToolPreviewProps = EditorViewProps & {
  readonly showWithoutChange: boolean;
};

function StandardPreview(props: ToolPreviewProps) {
  const liveStyle = props.livePreview
    ? getLivePreviewStyle(
        props.livePreview.operation,
        props.livePreview.baseline,
      )
    : undefined;
  const isStandardTool =
    props.selected?.tool !== "crop" &&
    props.selected?.tool !== "rotate" &&
    props.selected?.tool !== "colour_pop" &&
    props.selected?.tool !== "effects" &&
    props.selected?.tool !== "focus";
  if (props.showWithoutChange && isStandardTool && props.operationSourceUrl) {
    return (
      <img
        className="max-h-full max-w-full object-contain"
        src={props.operationSourceUrl}
        alt="Before current change"
      />
    );
  }
  if (!props.previewUrl) {
    return <span className="text-slate-300">Preparing preview…</span>;
  }
  return (
    <img
      className="max-h-full max-w-full object-contain"
      src={props.previewUrl}
      alt="Edit preview"
      style={liveStyle}
    />
  );
}

function MaskPreview(props: ToolPreviewProps) {
  return (
    <PhotoMaskOverlay
      drawKind={props.drawMaskKind}
      masks={props.history.present.masks}
      previewUrl={props.previewUrl}
      selectedMaskId={props.selectedMaskId}
      onCancelDraw={() => props.onDrawMaskKindChange(null)}
      onCreate={props.onMaskCreate}
      onSelect={props.onSelectMask}
    />
  );
}

function SelectedToolPreview(props: ToolPreviewProps): ReactNode {
  const selected = props.selected;
  if (selected?.tool === "crop") {
    return (
      <PhotoCropOverlay
        key={selected.id}
        operation={selected}
        previewRevision={props.previewRevision}
        previewUrl={props.previewUrl}
        showWithoutChange={props.showWithoutChange}
        sourceUrl={props.operationSourceUrl}
        onCommit={props.onCommitSelected}
        onDraftChange={props.onDraftSelected}
      />
    );
  }
  if (selected?.tool === "rotate") {
    return (
      <PhotoRotateOverlay
        key={selected.id}
        operation={selected}
        showWithoutChange={props.showWithoutChange}
        sourceUrl={props.operationSourceUrl}
        onCommit={props.onCommitSelected}
        onDraftChange={props.onDraftSelected}
      />
    );
  }
  if (selected?.tool === "colour_pop") {
    return (
      <PhotoColourPopOverlay
        key={selected.id}
        operation={selected}
        previewUrl={props.previewUrl}
        showWithoutChange={props.showWithoutChange}
        sourceUrl={props.operationSourceUrl}
        onChange={props.onCommitSelected}
      />
    );
  }
  if (selected?.tool === "effects") {
    return (
      <PhotoEffectsOverlay
        key={selected.id}
        operation={selected}
        previewUrl={props.previewUrl}
        showWithoutChange={props.showWithoutChange}
        sourceUrl={props.operationSourceUrl}
        onChange={props.onCommitSelected}
      />
    );
  }
  if (selected?.tool === "focus") {
    return (
      <PhotoFocusOverlay
        key={selected.id}
        operation={selected}
        previewUrl={props.previewUrl}
        showWithoutChange={props.showWithoutChange}
        sourceUrl={props.operationSourceUrl}
        onCommit={props.onCommitSelected}
        onPreviewChange={props.onDraftSelected}
      />
    );
  }
  return <StandardPreview {...props} />;
}

export function ToolPreviewRegion(props: ToolPreviewProps) {
  const preview = props.maskPanelOpen ? (
    <MaskPreview {...props} />
  ) : (
    <SelectedToolPreview {...props} />
  );
  return (
    <PhotoEditorToolBoundary
      key={`${props.selected?.id ?? "none"}-preview`}
      toolName={props.selected?.name ?? "Photo"}
      region="preview"
    >
      {preview}
    </PhotoEditorToolBoundary>
  );
}
