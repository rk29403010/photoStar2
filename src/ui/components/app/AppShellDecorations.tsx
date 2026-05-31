import { DevConsole } from '../DevConsole';
import type { DevRuntimeImpact } from '@contracts/devRuntime';
import { getDevRuntimeImpactIndicator } from './devRuntimeImpactModel';

export type AppConnectionOverlayState = {
  title: string;
  message: string;
  tone: 'warning' | 'info';
};

export function ErrorBanner({ error }: { readonly error: string }) {
  return (
    <div className="bg-red-500/10 border-b border-red-500 text-red-500 px-5 py-3 flex justify-between items-center font-medium z-[100]">
      <span>{error}</span>
      <button onClick={() => globalThis.location.reload()} className="bg-red-600 hover:bg-red-700 text-white border-none px-3 py-1.5 rounded-md cursor-pointer font-bold transition-colors">Retry Connection</button>
    </div>
  );
}

function TaskDrawerStatusButton({
  jobCount,
  isMinimized,
  onClick,
}: {
  readonly jobCount: number;
  readonly isMinimized: boolean;
  readonly onClick: () => void;
}) {
  const activeClass = !isMinimized
    ? 'bg-content/10 border-content/20 text-content'
    : 'bg-surface-secondary/80 border-content/10 text-content-secondary hover:text-content hover:bg-surface-secondary';

  return (
    <button
      id="task-drawer-toggle"
      onClick={onClick}
      title="Toggle Background Tasks"
      className={`flex items-center gap-1.5 px-2 py-0.75 text-[11px] rounded-md font-mono cursor-pointer border backdrop-blur-md transition-all shadow-md shrink-0 mr-2 ${activeClass}`}
    >
      <span className="text-sm">⚡</span>
      {!isMinimized ? 'Hide Tasks' : `Tasks${jobCount > 0 ? ` (${jobCount})` : ''}`}
    </button>
  );
}

export function AppStatusRightSlot({
  isTaskDrawerMinimized,
  activeOverlayJobCount,
  onToggleTaskDrawer,
  devRuntimeImpact,
}: {
  readonly isTaskDrawerMinimized: boolean;
  readonly activeOverlayJobCount: number;
  readonly onToggleTaskDrawer: () => void;
  readonly devRuntimeImpact: DevRuntimeImpact | null;
}) {
  const indicator = getDevRuntimeImpactIndicator(devRuntimeImpact);

  const indicatorClass = (function () {
    if (indicator?.tone === 'error') {
      return 'border-red-500 bg-red-950/75 text-red-200';
    }
    if (indicator?.tone === 'warning') {
      return 'border-amber-500 bg-amber-950/80 text-amber-200';
    }
    return 'border-sky-500 bg-sky-950/80 text-sky-200';
  }());

  return (
    <>
      <TaskDrawerStatusButton jobCount={activeOverlayJobCount} isMinimized={isTaskDrawerMinimized} onClick={onToggleTaskDrawer} />
      {indicator ? (
        <div
          title={indicator.title}
          className={`border rounded-full px-2.5 py-0.5 text-[11px] font-bold mr-2 shrink-0 ${indicatorClass}`}
        >
          {indicator.shortLabel}
        </div>
      ) : null}
      <DevConsole />
    </>
  );
}

function ConnectionOverlay({
  title,
  status,
  message,
  tone,
}: {
  readonly title: string;
  readonly status: string;
  readonly message: string;
  readonly tone: 'warning' | 'info';
}) {
  const borderClass = tone === 'warning' ? 'border-red-500/40' : 'border-blue-500/35';

  return (
    <div className="absolute inset-0 z-40 bg-black/50 flex items-center justify-center p-6">
      <div className={`w-[min(520px,100%)] border bg-surface/90 rounded-xl p-6 shadow-2xl ${borderClass}`}>
        <div className={`text-[13px] uppercase tracking-widest mb-2.5 ${tone === 'warning' ? 'text-red-300' : 'text-blue-300'}`}>{title}</div>
        <div className="text-[17px] font-semibold text-content mb-2">{status}</div>
        <div className="text-content-secondary leading-relaxed">{message}</div>
      </div>
    </div>
  );
}

export function ConnectionOverlayLayer({
  connectionOverlay,
  status,
}: {
  readonly connectionOverlay: AppConnectionOverlayState | null;
  readonly status: string;
}) {
  if (!connectionOverlay) {
    return null;
  }

  return (
    <ConnectionOverlay
      title={connectionOverlay.title}
      status={status}
      message={connectionOverlay.message}
      tone={connectionOverlay.tone}
    />
  );
}
