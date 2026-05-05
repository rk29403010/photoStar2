import type React from 'react';
import { useState } from 'react';
import type { Asset } from '@contracts/core';

const J = { key: '#93c5fd', str: '#86efac', num: '#fcd34d', bool: '#67e8f9', nil: '#f87171', brace: '#94a3b8', index: '#475569' } as const;
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
  if (isArrayParent && /^\d+$/.test(keyName)) {return <span style={{ color: J.index }}>[{keyName}]&nbsp;</span>;}
  return <><span style={{ color: J.key }}>&quot;{keyName}&quot;</span><span style={{ color: J.brace }}>:&nbsp;</span></>;
}

const JsonLeaf: React.FC<{ readonly value: JsonValue; readonly keyLabel: React.ReactNode; readonly comma: string; readonly indent: number; readonly wordWrap: boolean }> = ({ value, keyLabel, comma, indent, wordWrap }) => {
  const valueEl = (function () {
    if (typeof value === 'string') {
      return <span style={{ color: J.str, wordBreak: wordWrap ? 'break-all' : 'normal', whiteSpace: wordWrap ? 'pre-wrap' : 'nowrap' }}>&quot;{value}&quot;</span>;
    }
    if (typeof value === 'number') {
      return <span style={{ color: J.num }}>{value}</span>;
    }
    if (typeof value === 'boolean') {
      return <span style={{ color: J.bool }}>{String(value)}</span>;
    }
    return <span style={{ color: J.nil }}>null</span>;
  }());

  return <div style={{ paddingLeft: indent, lineHeight: '1.7', display: 'flex', gap: 2, minWidth: 0 }}>{keyLabel}{valueEl}<span style={{ color: J.brace }}>{comma}</span></div>;
};

const JsonBranch: React.FC<{ readonly value: JsonValue; readonly entries: [string, unknown][]; readonly keyLabel: React.ReactNode; readonly comma: string; readonly isArray: boolean; readonly wordWrap: boolean; readonly defaultOpen: boolean; readonly depth: number }> = ({ value, entries, keyLabel, comma, isArray, wordWrap, defaultOpen, depth }) => {
  const [open, setOpen] = useState(defaultOpen);
  const summary = isArray ? <span style={{ color: J.brace }}>[<span style={{ color: J.index, fontSize: 9 }}> {entries.length} </span>]</span> : <span style={{ color: J.brace }}>{'{'}…{'}'}</span>;

  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : depth * 14 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', borderRadius: 3, padding: '1px 2px', lineHeight: '1.7', userSelect: 'none' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}>
        <span style={{ fontSize: 9, color: '#475569', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.12s', width: 10, flexShrink: 0 }}>▶</span>
        {keyLabel}
        {!open && <>{summary}<span style={{ color: J.brace }}>{comma}</span></>}
        {open && <span style={{ color: J.brace }}>{Array.isArray(value) ? '[' : '{'}</span>}
      </div>

      {open && <div style={{ paddingLeft: 14, borderLeft: '1px solid rgba(255,255,255,0.05)' }}>{entries.map(([k, v], i) => <JsonNode key={k} keyName={k} value={v} depth={0} isLast={i === entries.length - 1} wordWrap={wordWrap} defaultOpen={false} />)}</div>}
      {open && <div style={{ lineHeight: '1.7' }}><span style={{ color: J.brace }}>{Array.isArray(value) ? ']' : '}'}{comma}</span></div>}
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
        <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(96,165,250,0.25)', background: 'rgba(30,41,59,0.55)', fontSize: 11, color: '#93c5fd' }}>
          Loading full metadata evidence for this photo…
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }}>
        <button onClick={() => setWordWrap((w) => !w)} title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'} style={{ background: wordWrap ? 'rgba(99,102,241,0.25)' : 'rgba(51,65,85,0.8)', border: `1px solid ${wordWrap ? '#6366f1' : '#334155'}`, color: wordWrap ? '#a5b4fc' : '#94a3b8', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 14, lineHeight: 1, transition: 'all 0.15s' }}>↵</button>
        <button onClick={async () => { try { await navigator.clipboard.writeText(jsonStr); } catch { /* ignore */ } }} style={{ background: 'rgba(51,65,85,0.8)', border: '1px solid #334155', color: '#94a3b8', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>📋 Copy JSON</button>
      </div>

      <div style={{ fontFamily: '"Cascadia Code","Consolas",monospace', fontSize: 11, background: 'rgba(0,0,0,0.4)', border: '1px solid #1e293b', borderRadius: 6, padding: '10px 12px', overflowY: 'auto', overflowX: wordWrap ? 'hidden' : 'auto', maxHeight: 'calc(100vh - 240px)', lineHeight: 1.6 }}>
        {Object.entries(sanitised).map(([k, v], i, arr) => <JsonNode key={k} keyName={k} value={v} depth={0} isLast={i === arr.length - 1} wordWrap={wordWrap} defaultOpen />)}
      </div>
    </div>
  );
};
