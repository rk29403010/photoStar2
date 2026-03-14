import type { ReactNode } from 'react';
import metadata from '../../../../metadata.json';
import type { CurrentPhotoStatus } from '@shared/utils/libraryGallery';

interface AppStatusBarProps {
  statusMessage: string | null;
  activityMessage?: string | null;
  status: string;
  view: 'library' | 'people' | 'dashboard' | 'albums';
  librarySelectionCount: number;
  shownAssetsCount: number;
  peopleSelectionCount: number;
  totalPhotoCount: number;
  peopleCount: number;
  currentPhoto?: CurrentPhotoStatus | null;
  rightSlot?: ReactNode;
}

function getStatusDotColor(statusMessage: string | null, status: string): string {
  if (statusMessage) {
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

function CurrentPhotoSegment({ currentPhoto }: { currentPhoto: CurrentPhotoStatus }) {
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

export function AppStatusBar({ statusMessage, activityMessage, status, view, librarySelectionCount, shownAssetsCount, peopleSelectionCount, totalPhotoCount, peopleCount, currentPhoto, rightSlot }: AppStatusBarProps) {
  const displayedStatus = statusMessage ?? activityMessage ?? status;
  const dotColor = getStatusDotColor(displayedStatus === status ? null : displayedStatus, status);
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
