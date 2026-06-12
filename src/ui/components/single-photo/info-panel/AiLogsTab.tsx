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
    return <div className="text-content-secondary text-xs py-2.5">Loading AI logs...</div>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="ai-log-select" className="text-[11px] font-bold text-content-secondary uppercase tracking-wider">
        Select AI Call Log
      </label>
      <select
        id="ai-log-select"
        value={selectedLogId}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full px-2.5 py-2 bg-surface border border-content/10 rounded-md text-content text-xs outline-none cursor-pointer"
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
  <div className="p-2.5 bg-surface-secondary border border-content/5 rounded-md text-[11px] grid grid-cols-2 gap-2">
    <div>
      <span className="text-content-secondary/80">Model: </span>
      <span className="font-semibold text-content">{detail.model_name}</span>
    </div>
    <div>
      <span className="text-content-secondary/80">Timestamp: </span>
      <span className="font-semibold text-content">{formatTimestamp(detail.created_at)}</span>
    </div>
    <div>
      <span className="text-content-secondary/80">Call Type: </span>
      <span className="font-semibold text-content">{detail.call_type}</span>
    </div>
    <div>
      <span className="text-content-secondary/80">Status: </span>
      {detail.error_message ? (
        <span className="font-bold text-rose-400">Failed</span>
      ) : (
        <span className="font-bold text-emerald-400">Success</span>
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
  <div className="flex flex-col gap-1.5 flex-[1_1_auto] min-h-[120px]">
    <div className="flex justify-between items-center">
      <span className={`text-[11px] font-bold uppercase tracking-wider ${isError ? 'text-rose-400' : 'text-content-secondary'}`}>
        {label}
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="px-2 py-0.5 text-[10px] bg-surface border border-content/10 rounded text-content hover:bg-surface-secondary cursor-pointer transition-colors"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
    <pre
      className="m-0 p-2.5 bg-zinc-950/70 border rounded-md text-[11px] font-mono overflow-auto whitespace-pre-wrap break-all flex-1"
      style={{
        borderColor: isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
        color
      }}
    >
      {content}
    </pre>
  </div>
);

type ErrorBannerProps = { readonly text: string };

const ErrorBanner: React.FC<ErrorBannerProps> = ({ text }) => (
  <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-md text-rose-300 text-xs">
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
    <div className="flex flex-col gap-3 flex-1 min-h-0">
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
    return <div className="text-content-secondary text-xs py-2.5">Loading log details...</div>;
  }
  if (!detail && logsCount > 0) {
    return (
      <div className="flex-1 flex items-center justify-center border border-dashed border-content/10 rounded-lg p-5 text-content-secondary/60 text-xs text-center">
        Select an AI call log entry from the dropdown above to view the prompt and response details.
      </div>
    );
  }
  if (logsCount === 0 && !loadingList) {
    return (
      <div className="flex-1 flex items-center justify-center border border-dashed border-content/10 rounded-lg p-5 text-content-secondary/60 text-xs text-center">
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
    <div className="flex flex-col gap-3.5 h-full text-content">
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
