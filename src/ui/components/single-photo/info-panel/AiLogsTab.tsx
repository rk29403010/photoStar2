import React, { useEffect, useState } from 'react';

export type AiLogsTabProps = {
  readonly assetId: string;
  readonly onGetAiCallsLog?: (assetId: string) => Promise<unknown[]>;
  readonly onGetAiCallLogDetail?: (logId: string) => Promise<unknown>;
  readonly analysisState?: string;
};

export type AiCallSummary = {
  id: string;
  call_type: string;
  model_name: string;
  created_at: string;
  has_error: boolean;
};

export type AiCallDetail = {
  id: string;
  asset_id: string;
  call_type: string;
  model_name: string;
  prompt: string;
  result: string | null;
  error_message: string | null;
  created_at: string;
};

const formatTimestamp = (ts: string) => {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) {
      return ts;
    }
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return ts;
  }
};

type LogDropdownProps = {
  readonly logs: AiCallSummary[];
  readonly selectedLogId: string;
  readonly onSelect: (id: string) => void;
  readonly loadingList: boolean;
};

const LogDropdown: React.FC<LogDropdownProps> = ({ logs, selectedLogId, onSelect, loadingList }) => {
  if (loadingList) {
    return <div style={{ color: '#94a3b8', fontSize: 12, padding: '10px 0' }}>Loading AI logs...</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor="ai-log-select" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Select AI Call Log
      </label>
      <select
        id="ai-log-select"
        value={selectedLogId}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 6,
          color: '#e2e8f0',
          fontSize: 12,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="">
          {logs.length === 0 ? 'No logs available' : `Choose from ${logs.length} entries...`}
        </option>
        {logs.map((log) => (
          <option key={log.id} value={log.id}>
            {log.has_error ? '❌' : '✅'} {formatTimestamp(log.created_at)} ({log.call_type})
          </option>
        ))}
      </select>
    </div>
  );
};

type LogMetadataRowProps = {
  readonly detail: AiCallDetail;
};

const LogMetadataRow: React.FC<LogMetadataRowProps> = ({ detail }) => (
  <div
    style={{
      padding: 10,
      backgroundColor: 'rgba(30, 41, 59, 0.5)',
      border: '1px solid #1e293b',
      borderRadius: 6,
      fontSize: 11,
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
    }}
  >
    <div>
      <span style={{ color: '#94a3b8' }}>Model: </span>
      <span style={{ fontWeight: 500, color: '#cbd5e1' }}>{detail.model_name}</span>
    </div>
    <div>
      <span style={{ color: '#94a3b8' }}>Timestamp: </span>
      <span style={{ fontWeight: 500, color: '#cbd5e1' }}>{formatTimestamp(detail.created_at)}</span>
    </div>
    <div>
      <span style={{ color: '#94a3b8' }}>Call Type: </span>
      <span style={{ fontWeight: 500, color: '#cbd5e1' }}>{detail.call_type}</span>
    </div>
    <div>
      <span style={{ color: '#94a3b8' }}>Status: </span>
      {detail.error_message ? (
        <span style={{ fontWeight: 600, color: '#f87171' }}>Failed</span>
      ) : (
        <span style={{ fontWeight: 600, color: '#4ade80' }}>Success</span>
      )}
    </div>
  </div>
);

type LogCopyablePanelProps = {
  readonly label: string;
  readonly content: string;
  readonly color: string;
  readonly isError?: boolean;
  readonly onCopy: () => void;
  readonly copied: boolean;
};

const LogCopyablePanel: React.FC<LogCopyablePanelProps> = ({ label, content, color, isError, onCopy, copied }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 auto', minHeight: 120 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: isError ? '#f87171' : '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <button
        type="button"
        onClick={onCopy}
        style={{
          padding: '2px 8px',
          fontSize: 10,
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 4,
          color: '#cbd5e1',
          cursor: 'pointer',
          transition: 'background-color 0.15s',
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
    <pre
      style={{
        margin: 0,
        padding: 10,
        backgroundColor: '#090d16',
        border: isError ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid #1e293b',
        borderRadius: 6,
        fontSize: 11,
        fontFamily: 'monospace',
        color,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        flex: 1,
      }}
    >
      {content}
    </pre>
  </div>
);

type ErrorBannerProps = { readonly text: string };

const ErrorBanner: React.FC<ErrorBannerProps> = ({ text }) => (
  <div style={{ padding: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, color: '#fca5a5', fontSize: 12 }}>
    ⚠️ {text}
  </div>
);

import { buildGeminiResponseSchema } from '../../../../services/workflowRuntime/modules/generateAiMetadata/geminiResponseSchema';

type LogDetailViewProps = {
  readonly detail: AiCallDetail;
  readonly copiedPrompt: boolean;
  readonly copiedResult: boolean;
  readonly copiedSchema: boolean;
  readonly onCopy: (text: string, type: 'prompt' | 'result' | 'schema') => void;
};

const LogDetailView: React.FC<LogDetailViewProps> = ({ detail, copiedPrompt, copiedResult, copiedSchema, onCopy }) => {
  const strategy = detail.call_type === 'scout' ? 'overview_only' : 'overview_plus_tiles';
  const schemaObj = buildGeminiResponseSchema(strategy);
  const schemaString = JSON.stringify(schemaObj, null, 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      <LogMetadataRow detail={detail} />
      <LogCopyablePanel
        label="Prompt"
        content={detail.prompt}
        color="#a7f3d0"
        copied={copiedPrompt}
        onCopy={() => onCopy(detail.prompt, 'prompt')}
      />
      <LogCopyablePanel
        label="Requested Response Schema"
        content={schemaString}
        color="#fef08a"
        copied={copiedSchema}
        onCopy={() => onCopy(schemaString, 'schema')}
      />
      {detail.error_message ? (
        <LogCopyablePanel
          label="Error Message"
          content={detail.error_message}
          color="#fca5a5"
          isError
          copied={copiedResult}
          onCopy={() => onCopy(detail.error_message ?? '', 'result')}
        />
      ) : (
        <LogCopyablePanel
          label="VLM Response"
          content={detail.result ?? ''}
          color="#93c5fd"
          copied={copiedResult}
          onCopy={() => onCopy(detail.result ?? '', 'result')}
        />
      )}
    </div>
  );
};

type LogEmptyStatesProps = {
  readonly loadingDetail: boolean;
  readonly detail: AiCallDetail | null;
  readonly logsCount: number;
  readonly loadingList: boolean;
};

const LogEmptyStates: React.FC<LogEmptyStatesProps> = ({ loadingDetail, detail, logsCount, loadingList }) => {
  if (loadingDetail) {
    return <div style={{ color: '#94a3b8', fontSize: 12, padding: '10px 0' }}>Loading log details...</div>;
  }
  if (!detail && logsCount > 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #334155', borderRadius: 8, padding: 20, color: '#64748b', fontSize: 12, textAlign: 'center' }}>
        Select an AI call log entry from the dropdown above to view the prompt and response details.
      </div>
    );
  }
  if (logsCount === 0 && !loadingList) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #334155', borderRadius: 8, padding: 20, color: '#64748b', fontSize: 12, textAlign: 'center' }}>
        No AI logs recorded for this photo yet.
      </div>
    );
  }
  return null;
};

function useAiLogsState(
  assetId: string,
  onGetAiCallsLog?: (assetId: string) => Promise<unknown[]>,
  onGetAiCallLogDetail?: (logId: string) => Promise<unknown>,
  analysisState?: string,
) {
  const [logs, setLogs] = useState<AiCallSummary[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<string>('');
  const [detail, setDetail] = useState<AiCallDetail | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [copiedResult, setCopiedResult] = useState<boolean>(false);
  const [copiedSchema, setCopiedSchema] = useState<boolean>(false);

  useEffect(() => {
    if (!onGetAiCallsLog) {
      return;
    }
    setLoadingList(true);
    setLogs([]);
    setSelectedLogId('');
    setDetail(null);
    setErrorText(null);

    onGetAiCallsLog(assetId)
      .then((data) => setLogs(data as AiCallSummary[]))
      .catch((err) => setErrorText(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingList(false));
  }, [assetId, onGetAiCallsLog, analysisState]);

  useEffect(() => {
    if (!selectedLogId || !onGetAiCallLogDetail) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setDetail(null);
    setErrorText(null);

    onGetAiCallLogDetail(selectedLogId)
      .then((data) => setDetail(data as AiCallDetail))
      .catch((err) => setErrorText(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingDetail(false));
  }, [selectedLogId, onGetAiCallLogDetail]);

  const handleCopy = (text: string, type: 'prompt' | 'result' | 'schema') => {
    void navigator.clipboard.writeText(text).then(() => {
      if (type === 'prompt') {
        setCopiedPrompt(true);
        setTimeout(() => setCopiedPrompt(false), 2000);
      } else if (type === 'schema') {
        setCopiedSchema(true);
        setTimeout(() => setCopiedSchema(false), 2000);
      } else {
        setCopiedResult(true);
        setTimeout(() => setCopiedResult(false), 2000);
      }
    });
  };

  return {
    logs,
    selectedLogId,
    setSelectedLogId,
    detail,
    loadingList,
    loadingDetail,
    errorText,
    copiedPrompt,
    copiedResult,
    copiedSchema,
    handleCopy,
  };
}

export const AiLogsTab: React.FC<AiLogsTabProps> = ({ assetId, onGetAiCallsLog, onGetAiCallLogDetail, analysisState }) => {
  const state = useAiLogsState(assetId, onGetAiCallsLog, onGetAiCallLogDetail, analysisState);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', color: '#e2e8f0' }}>
      {state.errorText && <ErrorBanner text={state.errorText} />}

      <LogDropdown
        logs={state.logs}
        selectedLogId={state.selectedLogId}
        onSelect={state.setSelectedLogId}
        loadingList={state.loadingList}
      />

      {state.detail && !state.loadingDetail && (
        <LogDetailView
          detail={state.detail}
          copiedPrompt={state.copiedPrompt}
          copiedResult={state.copiedResult}
          copiedSchema={state.copiedSchema}
          onCopy={state.handleCopy}
        />
      )}

      <LogEmptyStates
        loadingDetail={state.loadingDetail}
        detail={state.detail}
        logsCount={state.logs.length}
        loadingList={state.loadingList}
      />
    </div>
  );
};
