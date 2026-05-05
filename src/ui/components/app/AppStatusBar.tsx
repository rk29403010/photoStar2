import type { ReactNode } from 'react';
import metadata from '../../../../metadata.json';
import type { CurrentPhotoStatus } from '@shared/utils/libraryGallery';
import type { StatusBanner } from './statusBannerModel';

type AppStatusBarProps = {
  readonly statusBanner: StatusBanner | null;
  readonly activityMessage?: string | null;
  readonly status: string;
  readonly view: 'library' | 'people' | 'dashboard' | 'albums' | 'reviews' | 'vocabulary' | 'workflows' | 'groupDiagnostics';
  readonly librarySelectionCount: number;
  readonly shownAssetsCount: number;
  readonly peopleSelectionCount: number;
  readonly totalPhotoCount: number;
  readonly peopleCount: number;
  readonly currentPhoto?: CurrentPhotoStatus | null;
  readonly rightSlot?: ReactNode;
}

function getStatusDotColor(statusBanner: StatusBanner | null, status: string): string {
  if (statusBanner) {
    return '#60a5fa';
  }

  return status.toLowerCase().includes('error') ? 'red' : 'green';
}

function buildStatusSummary(view: AppStatusBarProps['view'], counts: {
  librarySelectionCount: number;
  shownAssetsCount: number;
  peopleSelectionCount: number;
  totalPhotoCount: number;
  peopleCount: number;
}): string {
  const summary: string[] = [];

  if (view === 'library' && counts.librarySelectionCount > 0) {
    summary.push(`${counts.librarySelectionCount} Selected`);
  }

  if (view === 'library' && counts.shownAssetsCount >= 0) {
    summary.push(`${counts.shownAssetsCount} Shown`);
  }

  if (view === 'people' && counts.peopleSelectionCount > 0) {
    summary.push(`${counts.peopleSelectionCount} Selected`);
  }

  summary.push(`${counts.totalPhotoCount} Photos`);
  summary.push(`${counts.peopleCount} People`);

  return summary.join(' | ');
}

function CurrentPhotoSegment({ currentPhoto }: { readonly currentPhoto: CurrentPhotoStatus }) {
  return (
    <div
      key={currentPhoto.filename}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.04)',
        color: '#d1d5db',
        animation: 'statusBarCurrentPhotoEnter 0.18s ease-out',
      }}
    >
      <span style={{ color: '#93c5fd', fontSize: '0.7rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Current photo</span>
      <span style={{ color: '#f3f4f6' }}>{currentPhoto.filename}</span>
      <span>{currentPhoto.sensitivity}</span>
      {currentPhoto.dimensions && <span>{currentPhoto.dimensions}</span>}
    </div>
  );
}

export function AppStatusBar({ statusBanner, activityMessage, status, view, librarySelectionCount, shownAssetsCount, peopleSelectionCount, totalPhotoCount, peopleCount, currentPhoto, rightSlot }: AppStatusBarProps) {
  const displayedStatus = statusBanner?.message ?? activityMessage ?? status;
  const dotColor = getStatusDotColor(displayedStatus === status ? null : statusBanner, status);
  const summary = buildStatusSummary(view, {
    librarySelectionCount,
    shownAssetsCount,
    peopleSelectionCount,
    totalPhotoCount,
    peopleCount,
  });

  return (
    <div
      style={{ height: '30px', background: '#1a1a1a', borderTop: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '12px', color: '#b3b3b3', flexShrink: 0, gap: 12 }}
    >
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <span style={{ marginRight: 8, color: dotColor }}>●</span>
        <span style={{ color: displayedStatus !== status ? '#93c5fd' : undefined }}>{displayedStatus}</span>
        {statusBanner?.actionLabel && statusBanner.onAction && (
          <button
            type="button"
            onClick={statusBanner.onAction}
            style={{
              marginLeft: 10,
              border: '1px solid rgba(147,197,253,0.45)',
              background: 'rgba(59,130,246,0.12)',
              color: '#bfdbfe',
              borderRadius: 999,
              cursor: 'pointer',
              fontSize: '0.78rem',
              padding: '2px 10px',
            }}
          >
            {statusBanner?.actionLabel}
          </button>
        )}
      </div>
      <div style={{ marginRight: 16 }}>{summary}</div>
      {currentPhoto && <CurrentPhotoSegment currentPhoto={currentPhoto} />}
      {rightSlot}
      <div style={{ flexShrink: 0, opacity: 0.6 }}>v{metadata.version}</div>
      <style>{`
        @keyframes statusBarCurrentPhotoEnter {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
