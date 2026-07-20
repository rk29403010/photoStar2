import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Layers, Redo2, Undo2 } from "lucide-react";
import type {
  Asset,
  PhotoEditDocument,
  PhotoEditMask,
  PhotoEditOperation,
  PhotoEditStyle,
  RenderPhotoEditInput,
  SavePhotoEditInput,
} from "@contracts/core";
import { Button, Card, Header, IconButton, Panel } from "../Primitives";
import { PhotoBeforeChangeButton } from "./PhotoBeforeChangeButton";
import { ToolPreviewRegion } from "./PhotoEditorPreview";
import { EditorSidebar } from "./PhotoEditorSidebar";
import type { DrawMaskKind } from "./PhotoMaskOverlay";
import {
  createPhotoEditOperation,
  type ToolDefinition,
} from "./photoEditorTools";
import { usePhotoEditPreview } from "./usePhotoEditPreview";

type Snapshot = { operations: PhotoEditOperation[]; masks: PhotoEditMask[] };
type LivePreview = {
  baseline: PhotoEditOperation;
  operation: PhotoEditOperation;
};

function buildInput(
  documentId: string,
  assetId: string,
  operations: PhotoEditOperation[],
  masks: PhotoEditMask[],
): SavePhotoEditInput {
  return {
    id: documentId,
    sourceAssetId: assetId,
    name: "Photo edit",
    operations,
    masks,
  };
}

function useHistory(initial: Snapshot) {
  const [present, setPresent] = useState(initial);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const replace = useCallback((next: Snapshot) => {
    setPresent((current) => {
      setPast((items) => [...items.slice(-29), current]);
      setFuture([]);
      return next;
    });
  }, []);
  const reset = useCallback((next: Snapshot) => {
    setPresent(next);
    setPast([]);
    setFuture([]);
  }, []);
  const undo = useCallback(
    () =>
      setPast((items) => {
        const previous = items.at(-1);
        if (!previous) {
          return items;
        }
        setPresent((current) => {
          setFuture((next) => [current, ...next]);
          return previous;
        });
        return items.slice(0, -1);
      }),
    [],
  );
  const redo = useCallback(
    () =>
      setFuture((items) => {
        const next = items[0];
        if (!next) {
          return items;
        }
        setPresent((current) => {
          setPast((previous) => [...previous, current]);
          return next;
        });
        return items.slice(1);
      }),
    [],
  );
  return {
    present,
    replace,
    reset,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}

type WorkspaceProps = {
  readonly asset: Asset;
  readonly onClose: () => void;
  readonly onRendered: (assetId: string) => void;
  readonly getWorkspace: (
    assetId: string,
  ) => Promise<{
    document: PhotoEditDocument | null;
    styles: PhotoEditStyle[];
  }>;
  readonly preview: (input: SavePhotoEditInput) => Promise<string>;
  readonly save: (input: SavePhotoEditInput) => Promise<PhotoEditDocument>;
  readonly render: (
    input: RenderPhotoEditInput,
  ) => Promise<{ document: PhotoEditDocument; assetId: string }>;
  readonly saveStyle: (style: {
    id: string;
    name: string;
    operations: PhotoEditOperation[];
    masks: PhotoEditMask[];
  }) => Promise<void>;
};

export type EditorViewProps = {
  readonly asset: Asset;
  readonly drawMaskKind: DrawMaskKind | null;
  readonly operationSourceUrl: string | null;
  readonly document: PhotoEditDocument | null;
  readonly history: ReturnType<typeof useHistory>;
  readonly livePreview: LivePreview | null;
  readonly maskPanelOpen: boolean;
  readonly previewUrl: string | null;
  readonly previewRevision: number;
  readonly renderMode: RenderPhotoEditInput["mode"];
  readonly selected: PhotoEditOperation | null;
  readonly selectedId: string | null;
  readonly selectedMaskId: string | null;
  readonly status: string;
  readonly styleName: string;
  readonly styles: PhotoEditStyle[];
  readonly onAddTool: (tool: ToolDefinition) => void;
  readonly onClose: () => void;
  readonly onCommitSelected: (operation: PhotoEditOperation) => void;
  readonly onDraftSelected: (operation: PhotoEditOperation) => void;
  readonly onDrawMaskKindChange: (kind: DrawMaskKind | null) => void;
  readonly onMaskCreate: (mask: PhotoEditMask) => void;
  readonly onMaskPanelOpenChange: (open: boolean) => void;
  readonly onMasksChange: (masks: PhotoEditMask[]) => void;
  readonly onRedo: () => void;
  readonly onRender: () => void;
  readonly onRenderModeChange: (mode: RenderPhotoEditInput["mode"]) => void;
  readonly onSaveDraft: () => void;
  readonly onSaveStyle: () => void;
  readonly onSelect: (id: string) => void;
  readonly onSelectMask: (id: string | null) => void;
  readonly onSetOperations: (operations: PhotoEditOperation[]) => void;
  readonly onStyleNameChange: (name: string) => void;
  readonly onUndo: () => void;
};

function EditorView(props: EditorViewProps) {
  const [comparisonOperationId, setComparisonOperationId] = useState<
    string | null
  >(null);
  const showWithoutChange =
    comparisonOperationId === props.selectedId && props.selectedId !== null;
  const setShowWithoutChange = (pressed: boolean) =>
    setComparisonOperationId(pressed ? props.selectedId : null);
  return (
    <div className="fixed inset-0 z-50 flex bg-slate-950">
      <main className="relative flex flex-1 items-center justify-center overflow-hidden">
        <ToolPreviewRegion {...props} showWithoutChange={showWithoutChange} />
        <div className="absolute left-4 top-4 flex gap-2">
          <Button variant="secondary" onClick={props.onClose}>
            Back to photo
          </Button>
          <IconButton
            aria-label="Undo"
            disabled={!props.history.canUndo}
            onClick={props.onUndo}
          >
            <Undo2 />
          </IconButton>
          <IconButton
            aria-label="Redo"
            disabled={!props.history.canRedo}
            onClick={props.onRedo}
          >
            <Redo2 />
          </IconButton>
          <PhotoBeforeChangeButton
            disabled={!props.selected || !props.operationSourceUrl}
            pressed={showWithoutChange}
            onPressedChange={setShowWithoutChange}
          />
        </div>
      </main>
      <Panel className="w-96 shrink-0">
        <Header>
          <div>
            <h2 className="font-semibold">Photo editor</h2>
            <p className="text-xs text-content-secondary">
              Non-destructive edit stack
            </p>
          </div>
          <Layers />
        </Header>
        <EditorSidebar
          key={props.selected?.id ?? "no-selected-tool"}
          {...props}
        />
      </Panel>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useWorkspaceLoader(params: {
  assetId: string;
  getWorkspace: WorkspaceProps["getWorkspace"];
  resetHistory: (snapshot: Snapshot) => void;
  setDocument: (document: PhotoEditDocument | null) => void;
  setDocumentId: (updater: (current: string) => string) => void;
  setRenderMode: (mode: RenderPhotoEditInput["mode"]) => void;
  setReady: (ready: boolean) => void;
  setStatus: (status: string) => void;
  setStyles: (styles: PhotoEditStyle[]) => void;
}) {
  const {
    assetId,
    getWorkspace,
    resetHistory,
    setDocument,
    setDocumentId,
    setReady,
    setRenderMode,
    setStatus,
    setStyles,
  } = params;
  useEffect(() => {
    setReady(false);
    void getWorkspace(assetId)
      .then((workspace) => {
        setDocumentId((current) => workspace.document?.id ?? current);
        setDocument(workspace.document);
        setStyles(workspace.styles);
        resetHistory({
          operations: workspace.document?.operations ?? [],
          masks: workspace.document?.masks ?? [],
        });
        setRenderMode(
          workspace.document?.renderedAssetId
            ? "replace_rendered"
            : "new_version",
        );
        setReady(true);
      })
      .catch((error: unknown) => setStatus(errorMessage(error)));
  }, [
    assetId,
    getWorkspace,
    resetHistory,
    setDocument,
    setDocumentId,
    setReady,
    setRenderMode,
    setStatus,
    setStyles,
  ]);
}

type EditorHistory = ReturnType<typeof useHistory>;

function findOperation(
  operations: PhotoEditOperation[],
  id: string | null,
): PhotoEditOperation | null {
  return operations.find((operation) => operation.id === id) ?? null;
}

function selectedDraftOperation(params: {
  committed: PhotoEditOperation | null;
  draft: PhotoEditOperation | null;
  selectedId: string | null;
}): PhotoEditOperation | null {
  return params.draft?.id === params.selectedId
    ? params.draft
    : params.committed;
}

function mergeDraftOperation(
  operations: PhotoEditOperation[],
  draft: PhotoEditOperation | null,
): PhotoEditOperation[] {
  if (!draft) {
    return operations;
  }
  return operations.map((operation) =>
    operation.id === draft.id ? draft : operation,
  );
}

function baselineForPreview(params: {
  committed: PhotoEditOperation | null;
  livePreview: LivePreview | null;
  operation: PhotoEditOperation;
}): PhotoEditOperation {
  if (params.livePreview?.operation.id === params.operation.id) {
    return params.livePreview.baseline;
  }
  return params.committed ?? params.operation;
}

function replaceChangedOperation(
  operations: PhotoEditOperation[],
  committed: PhotoEditOperation | null,
  operation: PhotoEditOperation,
): PhotoEditOperation[] | null {
  if (!committed || JSON.stringify(committed) === JSON.stringify(operation)) {
    return null;
  }
  return operations.map((item) =>
    item.id === operation.id ? operation : item,
  );
}

function useDraftPreviewState(params: {
  readonly committedSelected: PhotoEditOperation | null;
  readonly history: EditorHistory;
  readonly previewRevision: number;
}) {
  const [draftOperation, setDraftOperation] =
    useState<PhotoEditOperation | null>(null);
  const [livePreview, setLivePreview] = useState<LivePreview | null>(null);
  const [waitingRevision, setWaitingRevision] = useState<number | null>(null);
  useEffect(() => {
    if (
      waitingRevision !== null &&
      params.previewRevision > waitingRevision
    ) {
      setLivePreview(null);
      setWaitingRevision(null);
    }
  }, [params.previewRevision, waitingRevision]);
  const clearDraft = () => {
    setDraftOperation(null);
    setLivePreview(null);
    setWaitingRevision(null);
  };
  const selectDraft = (operation: PhotoEditOperation | null) => {
    setDraftOperation(operation);
    setLivePreview(null);
    setWaitingRevision(null);
  };
  const previewSelected = (operation: PhotoEditOperation) => {
    const baseline = baselineForPreview({
      committed: params.committedSelected,
      livePreview,
      operation,
    });
    setDraftOperation(operation);
    setLivePreview({ baseline, operation });
  };
  const commitSelected = (operation: PhotoEditOperation) => {
    const committed = findOperation(
      params.history.present.operations,
      operation.id,
    );
    const operations = replaceChangedOperation(
      params.history.present.operations,
      committed,
      operation,
    );
    setDraftOperation(operation);
    if (operations) {
      params.history.replace({ ...params.history.present, operations });
      setWaitingRevision(params.previewRevision);
    }
  };
  return {
    clearDraft,
    commitSelected,
    draftOperation,
    livePreview,
    previewSelected,
    selectDraft,
  };
}

function useEditorDraft(history: EditorHistory, previewRevision: number) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const committedSelected = findOperation(history.present.operations, selectedId);
  const draft = useDraftPreviewState({
    committedSelected,
    history,
    previewRevision,
  });
  const selected = selectedDraftOperation({
    committed: committedSelected,
    draft: draft.draftOperation,
    selectedId,
  });
  const effectiveOperations = useMemo(
    () => mergeDraftOperation(history.present.operations, draft.draftOperation),
    [draft.draftOperation, history.present.operations],
  );
  const setOperations = (operations: PhotoEditOperation[]) => {
    draft.clearDraft();
    history.replace({ ...history.present, operations });
  };
  const selectOperation = (id: string) => {
    const operation = findOperation(effectiveOperations, id);
    if (draft.draftOperation && draft.draftOperation.id !== id) {
      history.replace({ ...history.present, operations: effectiveOperations });
    }
    setSelectedId(id);
    draft.selectDraft(operation);
  };
  const addTool = (tool: ToolDefinition) => {
    const operation = createPhotoEditOperation(tool);
    history.replace({
      ...history.present,
      operations: [...effectiveOperations, operation],
    });
    setSelectedId(operation.id);
    draft.selectDraft(operation);
  };
  const undo = () => {
    draft.clearDraft();
    history.undo();
  };
  const redo = () => {
    draft.clearDraft();
    history.redo();
  };
  return {
    addTool,
    commitSelected: draft.commitSelected,
    effectiveOperations,
    livePreview: draft.livePreview,
    previewSelected: draft.previewSelected,
    redo,
    selected,
    selectedId,
    selectOperation,
    setOperations,
    undo,
  };
}

function useOperationSource(params: {
  assetId: string;
  documentId: string;
  history: EditorHistory;
  preview: WorkspaceProps["preview"];
  selectedId: string | null;
  setStatus: (status: string) => void;
  workspaceReady: boolean;
}): string | null {
  const {
    assetId,
    documentId,
    history,
    preview,
    selectedId,
    setStatus,
    workspaceReady,
  } = params;
  const sequenceRef = useRef(0);
  const [source, setSource] = useState<{
    key: string;
    url: string | null;
  } | null>(null);
  useEffect(() => {
    const sourceOperation = history.present.operations.find(
      (operation) => operation.id === selectedId,
    );
    if (!sourceOperation || !workspaceReady) {
      setSource(null);
      return;
    }
    const operationIndex = history.present.operations.findIndex(
      (operation) => operation.id === sourceOperation.id,
    );
    const operationsBefore = history.present.operations.slice(
      0,
      operationIndex,
    );
    const sourceKey = JSON.stringify({
      masks: history.present.masks,
      operationId: sourceOperation.id,
      operationsBefore,
    });
    if (source?.key === sourceKey) {
      return;
    }
    sequenceRef.current += 1;
    const sequence = sequenceRef.current;
    setSource({ key: sourceKey, url: null });
    void preview(
      buildInput(documentId, assetId, operationsBefore, history.present.masks),
    )
      .then((url) => {
        if (sequence === sequenceRef.current) {
          setSource({ key: sourceKey, url });
        }
      })
      .catch((error: unknown) => {
        if (sequence === sequenceRef.current) {
          setStatus(errorMessage(error));
        }
      });
  }, [
    assetId,
    documentId,
    history.present.masks,
    history.present.operations,
    preview,
    selectedId,
    setStatus,
    source,
    workspaceReady,
  ]);
  return source?.url ?? null;
}

function createEditorDocumentActions(params: {
  documentId: string;
  effectiveOperations: PhotoEditOperation[];
  history: EditorHistory;
  props: WorkspaceProps;
  renderMode: RenderPhotoEditInput["mode"];
  setDocument: (document: PhotoEditDocument | null) => void;
  setStatus: (status: string) => void;
  setStyleName: (name: string) => void;
  setStyles: (styles: PhotoEditStyle[]) => void;
  styleName: string;
  styles: PhotoEditStyle[];
}) {
  const {
    documentId,
    effectiveOperations,
    history,
    props,
    renderMode,
    setDocument,
    setStatus,
    setStyleName,
    setStyles,
    styleName,
    styles,
  } = params;
  const input = () =>
    buildInput(
      documentId,
      props.asset.id,
      effectiveOperations,
      history.present.masks,
    );
  const saveDraft = async () => {
    setStatus("Saving draft…");
    setDocument(await props.save(input()));
    setStatus("Draft saved");
  };
  const render = async () => {
    setStatus("Rendering full-resolution version…");
    const result = await props.render({ ...input(), mode: renderMode });
    setDocument(result.document);
    setStatus("New version rendered");
    props.onRendered(result.assetId);
  };
  const saveStyle = async () => {
    if (!styleName.trim()) {
      return;
    }
    const style = {
      id: crypto.randomUUID(),
      name: styleName.trim(),
      operations: effectiveOperations,
      masks: history.present.masks,
    };
    await props.saveStyle(style);
    setStyles([
      ...styles,
      {
        ...style,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    setStyleName("");
    setStatus("Style saved");
  };
  return { render, saveDraft, saveStyle };
}

function useWorkspaceState(props: WorkspaceProps, history: EditorHistory) {
  const [documentId, setDocumentId] = useState<string>(() => crypto.randomUUID());
  const [document, setDocument] = useState<PhotoEditDocument | null>(null);
  const [styles, setStyles] = useState<PhotoEditStyle[]>([]);
  const [status, setStatus] = useState("Loading editor…");
  const [styleName, setStyleName] = useState("");
  const [renderMode, setRenderMode] =
    useState<RenderPhotoEditInput["mode"]>("new_version");
  const [ready, setReady] = useState(false);
  useWorkspaceLoader({
    assetId: props.asset.id,
    getWorkspace: props.getWorkspace,
    resetHistory: history.reset,
    setDocument,
    setDocumentId,
    setReady,
    setRenderMode,
    setStatus,
    setStyles,
  });
  return {
    document,
    documentId,
    ready,
    renderMode,
    setDocument,
    setRenderMode,
    setStatus,
    setStyleName,
    setStyles,
    status,
    styleName,
    styles,
  };
}

function useWorkspacePreview(params: {
  readonly history: EditorHistory;
  readonly props: WorkspaceProps;
  readonly state: ReturnType<typeof useWorkspaceState>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const setStatus = params.state.setStatus;
  const input = useMemo(
    () =>
      buildInput(
        params.state.documentId,
        params.props.asset.id,
        params.history.present.operations,
        params.history.present.masks,
      ),
    [
      params.history.present.masks,
      params.history.present.operations,
      params.props.asset.id,
      params.state.documentId,
    ],
  );
  const handleReady = useCallback((nextUrl: string, nextRevision: number) => {
    setUrl(nextUrl);
    setRevision(nextRevision);
    setStatus("Preview ready");
  }, [setStatus]);
  const handleQueued = useCallback(() => setStatus("Updating preview…"), [setStatus]);
  const handleError = useCallback(
    (error: unknown) => setStatus(errorMessage(error)),
    [setStatus],
  );
  usePhotoEditPreview({
    debounceMs: 160,
    enabled: params.state.ready,
    input,
    request: params.props.preview,
    onQueued: handleQueued,
    onReady: handleReady,
    onError: handleError,
  });
  return { revision, url };
}

function useWorkspaceMasks(history: EditorHistory) {
  const [drawKind, setDrawKind] = useState<DrawMaskKind | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const change = (masks: PhotoEditMask[]) => {
    const maskIds = new Set(masks.map((mask) => mask.id));
    const operations = history.present.operations.map((operation) =>
      operation.maskId && !maskIds.has(operation.maskId)
        ? { ...operation, maskId: null }
        : operation,
    );
    history.replace({ operations, masks });
  };
  const create = (mask: PhotoEditMask) => {
    change([...history.present.masks, mask]);
    setSelectedId(mask.id);
    setDrawKind(null);
  };
  const setOpen = (open: boolean) => {
    setPanelOpen(open);
    if (!open) {
      setDrawKind(null);
    }
  };
  return {
    change,
    create,
    drawKind,
    panelOpen,
    selectedId,
    setDrawKind,
    setOpen,
    setSelectedId,
  };
}

export function PhotoEditorWorkspace(props: WorkspaceProps) {
  const history = useHistory({ operations: [], masks: [] });
  const state = useWorkspaceState(props, history);
  const preview = useWorkspacePreview({ history, props, state });
  const draft = useEditorDraft(history, preview.revision);
  const operationSourceUrl = useOperationSource({
    assetId: props.asset.id,
    documentId: state.documentId,
    history,
    preview: props.preview,
    selectedId: draft.selectedId,
    setStatus: state.setStatus,
    workspaceReady: state.ready,
  });
  const actions = createEditorDocumentActions({
    documentId: state.documentId,
    effectiveOperations: draft.effectiveOperations,
    history,
    props,
    renderMode: state.renderMode,
    setDocument: state.setDocument,
    setStatus: state.setStatus,
    setStyleName: state.setStyleName,
    setStyles: state.setStyles,
    styleName: state.styleName,
    styles: state.styles,
  });
  const masks = useWorkspaceMasks(history);
  return (
    <EditorView
      asset={props.asset}
      drawMaskKind={masks.drawKind}
      operationSourceUrl={operationSourceUrl}
      document={state.document}
      history={history}
      livePreview={draft.livePreview}
      maskPanelOpen={masks.panelOpen}
      previewUrl={preview.url}
      previewRevision={preview.revision}
      renderMode={state.renderMode}
      selected={draft.selected}
      selectedId={draft.selectedId}
      selectedMaskId={masks.selectedId}
      status={state.status}
      styleName={state.styleName}
      styles={state.styles}
      onAddTool={draft.addTool}
      onClose={props.onClose}
      onCommitSelected={draft.commitSelected}
      onDraftSelected={draft.previewSelected}
      onDrawMaskKindChange={masks.setDrawKind}
      onMaskCreate={masks.create}
      onMaskPanelOpenChange={masks.setOpen}
      onMasksChange={masks.change}
      onRedo={draft.redo}
      onRender={() => void actions.render()}
      onRenderModeChange={state.setRenderMode}
      onSaveDraft={() => void actions.saveDraft()}
      onSaveStyle={() => void actions.saveStyle()}
      onSelect={draft.selectOperation}
      onSelectMask={masks.setSelectedId}
      onSetOperations={draft.setOperations}
      onStyleNameChange={state.setStyleName}
      onUndo={draft.undo}
    />
  );
}

export class PhotoEditorErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Photo editor render failed", error, info);
  }
  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface">
        <Card>
          <h2 className="text-lg font-semibold text-content">
            The editor hit a problem
          </h2>
          <p className="text-content-secondary">{this.state.error}</p>
          <Button onClick={this.props.onClose}>Return to photo</Button>
        </Card>
      </div>
    );
  }
}
