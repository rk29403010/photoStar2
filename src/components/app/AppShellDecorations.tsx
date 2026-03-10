import { DevConsole } from '../DevConsole';

export type AppConnectionOverlayState = {
  title: string;
  message: string;
  tone: 'warning' | 'info';
};

export function ErrorBanner({ error }: { error: string }) {
  return (
    <div style={{ background: 'rgba(255, 68, 68, 0.1)', borderBottom: '1px solid #ff4444', color: '#ff4444', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '500', zIndex: 100 }}>
      <span>{error}</span>
      <button onClick={() => window.location.reload()} style={{ background: '#ff4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Retry Connection</button>
    </div>
  );
}

function TaskDrawerStatusButton({
  jobCount,
  onRestore,
}: {
  jobCount: number;
  onRestore: () => void;
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
}: {
  isTaskDrawerMinimized: boolean;
  activeOverlayJobCount: number;
  onRestoreTaskDrawer: () => void;
}) {
  const visibleJobCount = isTaskDrawerMinimized ? activeOverlayJobCount : 0;

  return (
    <>
      <TaskDrawerStatusButton jobCount={visibleJobCount} onRestore={onRestoreTaskDrawer} />
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
  title: string;
  status: string;
  message: string;
  tone: 'warning' | 'info';
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
  connectionOverlay: AppConnectionOverlayState | null;
  status: string;
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
