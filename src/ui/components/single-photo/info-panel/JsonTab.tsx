import type React from 'react';
import { useState } from 'react';
import type { Asset } from '@contracts/core';

type JsonValue = unknown;

type JsonNodeProps = {
  readonly value: JsonValue;
  readonly keyName?: string;
  readonly depth: number;
  readonly isLast: boolean;
  readonly wordWrap: boolean;
  readonly defaultOpen: boolean;
}

function getEntries(value: JsonValue): [string, unknown][] {
  if (value === null || typeof value !== 'object') {return [];}
  if (Array.isArray(value)) {return value.map((v, i) => [String(i), v] as [string, unknown]);}
  return Object.entries(value as Record<string, unknown>);
}

function renderKeyLabel(keyName: string | undefined, isArrayParent: boolean): React.ReactNode {
  if (keyName === undefined) {return null;}
  if (isArrayParent && /^\d+$/.test(keyName)) {return <span className="json-index">[{keyName}]&nbsp;</span>;}
  return <><span className="json-key">&quot;{keyName}&quot;</span><span className="json-brace">:&nbsp;</span></>;
}

const JsonLeaf: React.FC<{ readonly value: JsonValue; readonly keyLabel: React.ReactNode; readonly comma: string; readonly indent: number; readonly wordWrap: boolean }> = ({ value, keyLabel, comma, indent, wordWrap }) => {
  const valueEl = (function () {
    if (typeof value === 'string') {
      return <span className={`json-str ${wordWrap ? 'break-all whitespace-pre-wrap' : 'normal whitespace-nowrap'}`}>&quot;{value}&quot;</span>;
    }
    if (typeof value === 'number') {
      return <span className="json-num">{value}</span>;
    }
    if (typeof value === 'boolean') {
      return <span className="json-bool">{String(value)}</span>;
    }
    return <span className="json-nil">null</span>;
  }());

  return <div className="leading-relaxed flex gap-0.5 min-w-0" style={{ paddingLeft: indent }}>{keyLabel}{valueEl}<span className="json-brace">{comma}</span></div>;
};

const JsonBranch: React.FC<{ readonly value: JsonValue; readonly entries: [string, unknown][]; readonly keyLabel: React.ReactNode; readonly comma: string; readonly isArray: boolean; readonly wordWrap: boolean; readonly defaultOpen: boolean; readonly depth: number }> = ({ value, entries, keyLabel, comma, isArray, wordWrap, defaultOpen, depth }) => {
  const [open, setOpen] = useState(defaultOpen);
  const summary = isArray ? <span className="json-brace">[<span className="json-index text-[9px]"> {entries.length} </span>]</span> : <span className="json-brace">{'{'}…{'}'}</span>;

  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : depth * 14 }}>
      <div onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 cursor-pointer rounded px-0.5 py-px leading-relaxed select-none hover:bg-content/5">
        <span className={`text-[9px] text-zinc-500 inline-block w-2.5 shrink-0 motion-safe:transition-transform motion-safe:duration-100 ${open ? 'rotate-90' : 'rotate-0'}`}>▶</span>
        {keyLabel}
        {!open && <>{summary}<span className="json-brace">{comma}</span></>}
        {open && <span className="json-brace">{Array.isArray(value) ? '[' : '{'}</span>}
      </div>

      {open && <div className="pl-3.5 border-l border-content/5">{entries.map(([k, v], i) => <JsonNode key={k} keyName={k} value={v} depth={0} isLast={i === entries.length - 1} wordWrap={wordWrap} defaultOpen={false} />)}</div>}
      {open && <div className="leading-relaxed"><span className="json-brace">{Array.isArray(value) ? ']' : '}'}{comma}</span></div>}
    </div>
  );
};

const JsonNode: React.FC<JsonNodeProps> = ({ value, keyName, depth, isLast, wordWrap, defaultOpen }) => {
  const entries = getEntries(value);
  const comma = isLast ? '' : ',';
  const keyLabel = renderKeyLabel(keyName, Array.isArray(value));

  if (entries.length === 0) {
    return <JsonLeaf value={value} keyLabel={keyLabel} comma={comma} indent={depth * 14} wordWrap={wordWrap} />;
  }

  return <JsonBranch value={value} entries={entries} keyLabel={keyLabel} comma={comma} isArray={Array.isArray(value)} wordWrap={wordWrap} defaultOpen={defaultOpen} depth={depth} />;
};

export const JsonTab: React.FC<{ readonly asset: Asset }> = ({ asset }) => {
  const [wordWrap, setWordWrap] = useState(false);
  const jsonStr = JSON.stringify({ ...asset, faces: asset.faces?.map((f) => ({ ...f, embedding: undefined })), face_embeddings: undefined }, null, 2);
  const sanitised = JSON.parse(jsonStr) as Record<string, unknown>;
  const isLoadingEvidence = Boolean(asset.photo_metadata) && !asset.photo_metadata?.evidence;

  return (
    <div>
      {isLoadingEvidence && (
        <div className="mb-2.5 px-2.5 py-2 rounded-md border border-sky-400/20 bg-sky-950/20 text-[11px] text-sky-400 dark:text-sky-300">
          Loading full metadata evidence for this photo…
        </div>
      )}
      <div className="flex justify-end gap-1.5 mb-2">
        <button onClick={() => setWordWrap((w) => !w)} title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'} className={`px-2 py-1 rounded cursor-pointer text-sm leading-none transition-colors border ${wordWrap ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' : 'bg-surface-secondary/80 border-content/10 text-content-secondary hover:text-content'}`}>↵</button>
        <button onClick={async () => { try { await navigator.clipboard.writeText(jsonStr); } catch { /* ignore */ } }} className="bg-surface-secondary/80 border border-content/10 text-content-secondary hover:text-content px-2.5 py-1 rounded cursor-pointer text-[11px]">📋 Copy JSON</button>
      </div>

      <div className="font-mono text-[11px] bg-surface-secondary border border-content/10 rounded-lg p-3 overflow-y-auto leading-normal max-h-[calc(100vh-240px)]" style={{ overflowX: wordWrap ? 'hidden' : 'auto' }}>
        {Object.entries(sanitised).map(([k, v], i, arr) => <JsonNode key={k} keyName={k} value={v} depth={0} isLast={i === arr.length - 1} wordWrap={wordWrap} defaultOpen />)}
      </div>
    </div>
  );
};
