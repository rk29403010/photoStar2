import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Save, WandSparkles, X } from "lucide-react";
import type {
  PhotoEditMask,
  PhotoEditOperation,
  PhotoEditStyle,
} from "@contracts/core";
import { Button, Checkbox, IconButton, Input, Select } from "../Primitives";
import { PhotoAutomaticPanel } from "./PhotoAutomaticPanel";
import { PhotoEditorToolBoundary } from "./PhotoEditorToolBoundary";
import { PhotoMaskPanel } from "./PhotoMaskPanel";
import { buildPhotoAutomaticSuggestions } from "./photoAutomatic";
import type { PhotoAutomaticSuggestion } from "./photoAutomatic";
import {
  PHOTO_EDITOR_TOOLS,
  getPhotoEditToolPlugin,
  getPhotoEditToolUiPlugin,
  type ToolDefinition,
} from "./photoEditorTools";
import type { EditorViewProps } from "./PhotoEditorWorkspace";
import { usePhotoAutomaticAnalysis } from "./usePhotoAutomaticAnalysis";

function instantiatePhotoEditStyle(
  style: Pick<PhotoEditStyle, "operations" | "masks">,
): { operations: PhotoEditOperation[]; masks: PhotoEditMask[] } {
  const maskIds = new Map<string, string>();
  const masks = style.masks.map((mask) => {
    const id = crypto.randomUUID();
    maskIds.set(mask.id, id);
    return { ...mask, id };
  });
  const operations = style.operations.map((operation) => ({
    ...operation,
    id: crypto.randomUUID(),
    maskId: operation.maskId ? (maskIds.get(operation.maskId) ?? null) : null,
  }));
  return { operations, masks };
}

function StackList(props: {
  readonly operations: PhotoEditOperation[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onChange: (operations: PhotoEditOperation[]) => void;
}) {
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= props.operations.length) {
      return;
    }
    const next = [...props.operations];
    [next[index], next[target]] = [next[target], next[index]];
    props.onChange(next);
  };
  return (
    <div className="divide-y divide-content/10">
      {props.operations.map((operation, index) => (
        <div
          key={operation.id}
          className={`border-l-2 py-2 pl-2 transition-colors ${operation.id === props.selectedId ? "border-brand-accent bg-brand-accent/10" : "border-transparent"}`}
        >
          <div className="flex items-center gap-2">
            <Checkbox
              checked={operation.enabled}
              aria-label={`Toggle ${operation.name}`}
              onChange={() =>
                props.onChange(
                  props.operations.map((item) =>
                    item.id === operation.id
                      ? { ...item, enabled: !item.enabled }
                      : item,
                  ),
                )
              }
            />
            <button
              type="button"
              className="flex-1 text-left text-sm text-content"
              onClick={() => props.onSelect(operation.id)}
            >
              {operation.name}
            </button>
            <IconButton
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={15} />
            </IconButton>
            <IconButton
              aria-label="Move down"
              disabled={index === props.operations.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={15} />
            </IconButton>
            <IconButton
              aria-label="Delete change"
              onClick={() =>
                props.onChange(
                  props.operations.filter((item) => item.id !== operation.id),
                )
              }
            >
              <X size={15} />
            </IconButton>
          </div>
        </div>
      ))}
    </div>
  );
}

type OperationControlsProps = {
  readonly asset: EditorViewProps["asset"];
  readonly operation: PhotoEditOperation;
  readonly semanticGeometrySafe: boolean;
  readonly masks: PhotoEditMask[];
  readonly sourceUrl: string | null;
  readonly onCommit: (operation: PhotoEditOperation) => void;
  readonly onPreviewChange: (operation: PhotoEditOperation) => void;
};

type AutomaticOperationControlsProps = OperationControlsProps & {
  readonly automatic: ReturnType<typeof usePhotoAutomaticAnalysis>;
};

function GenericOperationControls(
  props: OperationControlsProps & { readonly definition: ToolDefinition },
) {
  return props.definition.controls.map((control) => (
    <div
      key={control.key}
      className="flex flex-col gap-1 text-xs text-content-secondary"
    >
      <span className="flex justify-between">
        <label htmlFor={`${props.operation.id}-${control.key}`}>
          {control.label}
        </label>
        <span>{String(props.operation.values[control.key])}</span>
      </span>
      <input
        id={`${props.operation.id}-${control.key}`}
        className="w-full accent-brand-accent"
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={Number(props.operation.values[control.key])}
        onInput={(event) => {
          const operation = {
            ...props.operation,
            values: {
              ...props.operation.values,
              [control.key]: Number(event.currentTarget.value),
            },
          };
          props.onPreviewChange(operation);
        }}
        onPointerUp={() => props.onCommit(props.operation)}
        onKeyUp={() => props.onCommit(props.operation)}
        onBlur={() => props.onCommit(props.operation)}
      />
    </div>
  ));
}

function MaskTargetControl(props: OperationControlsProps) {
  const changeMask = (maskId: string) => {
    const operation = { ...props.operation, maskId: maskId || null };
    props.onPreviewChange(operation);
    props.onCommit(operation);
  };
  return (
    <label className="flex flex-col gap-1 text-xs text-content-secondary">
      Apply to
      <Select
        value={props.operation.maskId ?? ""}
        onChange={(event) => changeMask(event.target.value)}
      >
        <option value="">Entire photo</option>
        {props.masks.map((mask) => (
          <option key={mask.id} value={mask.id}>
            {mask.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

function ToolSpecificOptions(
  props: AutomaticOperationControlsProps & { readonly definition: ToolDefinition },
): ReactNode {
  return <GenericOperationControls {...props} />;
}

function toolAutomaticSuggestion(
  props: AutomaticOperationControlsProps,
): PhotoAutomaticSuggestion | null {
  if (!props.automatic.analysis) {
    return null;
  }
  return buildPhotoAutomaticSuggestions(
    props.asset,
    props.automatic.analysis,
    props.semanticGeometrySafe,
  )
    .find((suggestion) => suggestion.tool === props.operation.tool) ?? null;
}

function ToolAutomaticAction(props: AutomaticOperationControlsProps) {
  const suggestion = toolAutomaticSuggestion(props);
  if (!suggestion) {
    return null;
  }
  const apply = () => {
    const operation = {
      ...props.operation,
      values: { ...props.operation.values, ...suggestion.values },
    };
    props.onPreviewChange(operation);
    props.onCommit(operation);
  };
  return (
    <div className="space-y-2">
      <Button className="w-full" variant="secondary" onClick={apply}>
        <WandSparkles aria-hidden="true" size={16} />
        {suggestion.label}
      </Button>
      <p className="text-xs leading-5 text-content-secondary">{suggestion.rationale}</p>
    </div>
  );
}

function OperationControls(props: OperationControlsProps) {
  const automatic = usePhotoAutomaticAnalysis(
    props.sourceUrl,
    props.asset,
    props.semanticGeometrySafe,
  );
  const automaticProps = { ...props, automatic };
  const definition = PHOTO_EDITOR_TOOLS.find(
    (tool) => tool.id === props.operation.tool,
  );
  if (!definition) {
    return <p className="text-sm text-content-secondary">{props.operation.name} is unavailable. Its recipe data is preserved until its tool plug-in is installed.</p>;
  }
  const plugin = getPhotoEditToolPlugin(props.operation.tool);
  const uiPlugin = getPhotoEditToolUiPlugin(props.operation.tool);
  const Controls = uiPlugin?.Controls;
  if (Controls) {
    return <Controls asset={props.asset} operation={props.operation} sourceUrl={props.sourceUrl} onCommit={props.onCommit} onPreviewChange={props.onPreviewChange} />;
  }
  return (
    <div className="space-y-3">
      <ToolAutomaticAction {...automaticProps} />
      <ToolSpecificOptions {...automaticProps} definition={definition} />
      {plugin?.capabilities?.maskCompatible && <MaskTargetControl {...props} />}
    </div>
  );
}

function ToolTile(props: {
  readonly tool: ToolDefinition;
  readonly onAdd: (tool: ToolDefinition) => void;
}) {
  const ToolIcon = props.tool.icon;
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-24 w-full flex-col px-2 touch-manipulation focus-visible:ring-2 focus-visible:ring-brand-accent"
      onClick={() => props.onAdd(props.tool)}
    >
      <ToolIcon
        aria-hidden="true"
        focusable="false"
        size={28}
        strokeWidth={1.8}
        className="shrink-0 text-brand-accent"
      />
      <span className="min-h-8 text-center text-xs leading-4">
        {props.tool.label}
      </span>
    </Button>
  );
}

function AutomaticToolTile(props: { readonly onSelect: () => void }) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-24 w-full flex-col px-2 touch-manipulation focus-visible:ring-2 focus-visible:ring-brand-accent"
      onClick={props.onSelect}
    >
      <WandSparkles
        aria-hidden="true"
        focusable="false"
        size={28}
        strokeWidth={1.8}
        className="shrink-0 text-brand-accent"
      />
      <span className="min-h-8 text-center text-xs leading-4">Automatic</span>
    </Button>
  );
}

function ToolControlsRegion(
  props: Pick<
    EditorViewProps,
    | "asset"
    | "history"
    | "onCommitSelected"
    | "onDraftSelected"
    | "operationSourceUrl"
    | "selected"
  >,
) {
  if (!props.selected) {
    return null;
  }
  const selectedIndex = props.history.present.operations.findIndex(
    (operation) => operation.id === props.selected?.id,
  );
  const semanticGeometrySafe = !props.history.present.operations
    .slice(0, Math.max(0, selectedIndex))
    .some((operation) => operation.enabled && getPhotoEditToolPlugin(operation.tool)?.capabilities?.geometryChanges);
  return (
    <PhotoEditorToolBoundary
      key={`${props.selected.id}-controls`}
      toolName={props.selected.name}
      region="controls"
    >
      <OperationControls
        asset={props.asset}
        operation={props.selected}
        semanticGeometrySafe={semanticGeometrySafe}
        masks={props.history.present.masks}
        sourceUrl={props.operationSourceUrl}
        onCommit={props.onCommitSelected}
        onPreviewChange={props.onDraftSelected}
      />
    </PhotoEditorToolBoundary>
  );
}

type AccordionSectionProps = {
  readonly children: ReactNode;
  readonly id: string;
  readonly open: boolean;
  readonly title: string;
  readonly onToggle: () => void;
};

function AccordionSection(props: AccordionSectionProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-content/10 bg-surface/50 shadow-sm">
      <h3>
        <button
          type="button"
          aria-controls={`${props.id}-content`}
          aria-expanded={props.open}
          className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-brand-accent"
          onClick={props.onToggle}
        >
          <span>{props.title}</span>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 motion-safe:transition-transform ${props.open ? "rotate-180" : ""}`}
          />
        </button>
      </h3>
      {props.open && (
        <div
          id={`${props.id}-content`}
          className="space-y-3 border-t border-content/10 p-3"
        >
          {props.children}
        </div>
      )}
    </section>
  );
}

type PrimaryPanel = "settings" | "tools" | null;

function ToolsAccordion(props: {
  readonly editor: EditorViewProps;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onAutomatic: () => void;
  readonly onToolAdd: (tool: ToolDefinition) => void;
}) {
  return (
    <AccordionSection
      id="photo-editor-tools"
      open={props.open}
      title="Tools"
      onToggle={props.onToggle}
    >
      <div className="grid grid-cols-3 gap-2">
        <AutomaticToolTile onSelect={props.onAutomatic} />
        {PHOTO_EDITOR_TOOLS.map((tool) => (
          <ToolTile key={tool.id} tool={tool} onAdd={props.onToolAdd} />
        ))}
      </div>
    </AccordionSection>
  );
}

function SettingsAccordion(props: {
  readonly editor: EditorViewProps;
  readonly automaticActive: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const editor = props.editor;
  const title = settingsTitle(props.automaticActive, editor.selected);
  const content = settingsContent(props.automaticActive, editor);
  return (
    <AccordionSection
      id="photo-editor-settings"
      open={props.open}
      title={title}
      onToggle={props.onToggle}
    >
      {content}
    </AccordionSection>
  );
}

function settingsTitle(automaticActive: boolean, selected: PhotoEditOperation | null): string {
  if (automaticActive) {
    return "Automatic settings";
  }
  if (selected) {
    return `${selected.name} settings`;
  }
  return "Tool settings";
}

function settingsContent(automaticActive: boolean, editor: EditorViewProps): ReactNode {
  if (automaticActive) {
    return (
      <PhotoAutomaticPanel
        asset={editor.asset}
        operations={editor.history.present.operations}
        sourceUrl={editor.previewUrl}
        onApply={editor.onSetOperations}
      />
    );
  }
  if (editor.selected) {
    return (
      <ToolControlsRegion
        asset={editor.asset}
        history={editor.history}
        selected={editor.selected}
        operationSourceUrl={editor.operationSourceUrl}
        onCommitSelected={editor.onCommitSelected}
        onDraftSelected={editor.onDraftSelected}
      />
    );
  }
  return <p className="text-sm text-content-secondary">Choose a tool to edit its settings.</p>;
}

function LayersAccordion(props: {
  readonly editor: EditorViewProps;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <AccordionSection
      id="photo-editor-layers"
      open={props.open}
      title="Layers & changes"
      onToggle={props.onToggle}
    >
      <StackList
        operations={props.editor.history.present.operations}
        selectedId={props.editor.selectedId}
        onSelect={props.editor.onSelect}
        onChange={props.editor.onSetOperations}
      />
    </AccordionSection>
  );
}

function MasksAccordion(props: {
  readonly editor: EditorViewProps;
  readonly onToggle: () => void;
}) {
  const editor = props.editor;
  return (
    <AccordionSection
      id="photo-editor-masks"
      open={editor.maskPanelOpen}
      title="Masks"
      onToggle={props.onToggle}
    >
      <PhotoMaskPanel
        asset={editor.asset}
        drawKind={editor.drawMaskKind}
        masks={editor.history.present.masks}
        selectedMaskId={editor.selectedMaskId}
        onChange={editor.onMasksChange}
        onDrawKindChange={editor.onDrawMaskKindChange}
        onSelect={editor.onSelectMask}
      />
    </AccordionSection>
  );
}

function StylesAccordion(props: {
  readonly editor: EditorViewProps;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const editor = props.editor;
  return (
    <AccordionSection
      id="photo-editor-styles"
      open={props.open}
      title="Styles"
      onToggle={props.onToggle}
    >
      <div className="flex gap-2">
        <Input
          value={editor.styleName}
          placeholder="Style name"
          onChange={(event) => editor.onStyleNameChange(event.target.value)}
        />
        <IconButton aria-label="Save style" onClick={editor.onSaveStyle}>
          <Save />
        </IconButton>
      </div>
      {editor.styles.map((style) => (
        <Button
          key={style.id}
          variant="secondary"
          onClick={() => editor.history.replace(instantiatePhotoEditStyle(style))}
        >
          {style.name}
        </Button>
      ))}
    </AccordionSection>
  );
}

function OutputAccordion(props: {
  readonly editor: EditorViewProps;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const editor = props.editor;
  if (!editor.document?.renderedAssetId) {
    return null;
  }
  return (
    <AccordionSection
      id="photo-editor-output"
      open={props.open}
      title="Version output"
      onToggle={props.onToggle}
    >
      <label htmlFor="photo-edit-render-mode" className="flex flex-col gap-1 text-sm">
        Next render
        <Select
          id="photo-edit-render-mode"
          value={editor.renderMode}
          onChange={(event) =>
            editor.onRenderModeChange(
              event.target.value === "replace_rendered"
                ? "replace_rendered"
                : "new_version",
            )
          }
        >
          <option value="replace_rendered">Update this version</option>
          <option value="new_version">Create another version</option>
        </Select>
      </label>
    </AccordionSection>
  );
}

export function EditorSidebar(props: EditorViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [primaryPanel, setPrimaryPanel] = useState<PrimaryPanel>(
    props.selected ? "settings" : "tools",
  );
  const [automaticActive, setAutomaticActive] = useState(false);
  const [layersOpen, setLayersOpen] = useState(true);
  const [stylesOpen, setStylesOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, []);
  useEffect(() => {
    setAutomaticActive(false);
  }, [props.selected?.id]);
  const togglePrimary = (panel: Exclude<PrimaryPanel, null>) => {
    setPrimaryPanel((current) => (current === panel ? null : panel));
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    });
  };
  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        <ToolsAccordion
          editor={props}
          open={primaryPanel === "tools"}
          onToggle={() => togglePrimary("tools")}
          onAutomatic={() => {
            setAutomaticActive(true);
            setPrimaryPanel("settings");
          }}
          onToolAdd={(tool) => {
            setAutomaticActive(false);
            props.onAddTool(tool);
          }}
        />
        <SettingsAccordion
          editor={props}
          automaticActive={automaticActive}
          open={primaryPanel === "settings"}
          onToggle={() => togglePrimary("settings")}
        />
        <LayersAccordion
          editor={props}
          open={layersOpen}
          onToggle={() => setLayersOpen((open) => !open)}
        />
        <MasksAccordion
          editor={props}
          onToggle={() => props.onMaskPanelOpenChange(!props.maskPanelOpen)}
        />
        <StylesAccordion
          editor={props}
          open={stylesOpen}
          onToggle={() => setStylesOpen((open) => !open)}
        />
        <OutputAccordion
          editor={props}
          open={outputOpen}
          onToggle={() => setOutputOpen((open) => !open)}
        />
      </div>
      <div className="border-t border-content/10 p-4">
        <p className="mb-2 text-xs text-content-secondary" role="status">
          {props.status}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={props.onSaveDraft}>
            Save draft
          </Button>
          <Button onClick={props.onRender}>Render version</Button>
        </div>
      </div>
    </>
  );
}
