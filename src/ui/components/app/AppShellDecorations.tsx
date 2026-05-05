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
    <div style={{ background: 'rgba(255, 68, 68, 0.1)', borderBottom: '1px solid #ff4444', color: '#ff4444', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '500', zIndex: 100 }}>
      <span>{error}</span>
      <button onClick={() => globalThis.location.reload()} style={{ background: '#ff4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Retry Connection</button>
    </div>
  );
}

function TaskDrawerStatusButton({
  jobCount,
  onRestore,
}: {
  readonly jobCount: number;
  readonly onRestore: () => void;
}) {
  if (jobCount <= 0) {
    return null;
  }

  return (
    <button
      onClick={onRestore}
      style={{
        border: '1px solid #155e75',
        background: 'rgba(8, 47, 73, 0.8)',
        color: '#cffafe',
        borderRadius: 999,
        padding: '2px 10px',
        fontSize: '11px',
        fontWeight: 700,
        cursor: 'pointer',
        marginRight: 8,
      }}
    >
      Tasks ({jobCount})
    </button>
  );
}

export function AppStatusRightSlot({
  isTaskDrawerMinimized,
  activeOverlayJobCount,
  onRestoreTaskDrawer,
  devRuntimeImpact,
}: {
  readonly isTaskDrawerMinimized: boolean;
  readonly activeOverlayJobCount: number;
  readonly onRestoreTaskDrawer: () => void;
  readonly devRuntimeImpact: DevRuntimeImpact | null;
}) {
  const visibleJobCount = isTaskDrawerMinimized ? activeOverlayJobCount : 0;
  const indicator = getDevRuntimeImpactIndicator(devRuntimeImpact);

  return (
    <>
      <TaskDrawerStatusButton jobCount={visibleJobCount} onRestore={onRestoreTaskDrawer} />
      {indicator ? (
        <div
          title={indicator.title}
          style={{
            border: (function () {
              if (indicator.tone === 'error') {return '1px solid #ef4444';}
              if (indicator.tone === 'warning') {return '1px solid #f59e0b';}
              return '1px solid #0ea5e9';
            }()),
            background: (function () {
              if (indicator.tone === 'error') {return 'rgba(127, 29, 29, 0.75)';}
              if (indicator.tone === 'warning') {return 'rgba(120, 53, 15, 0.8)';}
              return 'rgba(8, 47, 73, 0.8)';
            }()),
            color: (function () {
              if (indicator.tone === 'error') {return '#fecaca';}
              if (indicator.tone === 'warning') {return '#fde68a';}
              return '#bae6fd';
            }()),
            borderRadius: 999,
            padding: '2px 10px',
            fontSize: '11px',
            fontWeight: 700,
            marginRight: 8,
            flexShrink: 0,
          }}
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
  const accentColor = tone === 'warning' ? '#fca5a5' : '#93c5fd';
  const borderColor = tone === 'warning' ? 'rgba(248, 113, 113, 0.4)' : 'rgba(96, 165, 250, 0.35)';

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(0, 0, 0, 0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 'min(520px, 100%)', border: `1px solid ${borderColor}`, background: 'rgba(12, 12, 12, 0.9)', borderRadius: 12, padding: 24, boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)' }}>
        <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: accentColor, marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f3f4f6', marginBottom: 8 }}>{status}</div>
        <div style={{ color: '#cbd5e1', lineHeight: 1.5 }}>{message}</div>
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
