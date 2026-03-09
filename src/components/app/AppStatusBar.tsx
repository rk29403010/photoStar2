import type { ReactNode } from 'react';
import metadata from '../../../metadata.json';

interface AppStatusBarProps {
  statusMessage: string | null;
  status: string;
  view: 'library' | 'people' | 'dashboard' | 'albums';
  librarySelectionCount: number;
  shownAssetsCount: number;
  peopleSelectionCount: number;
  totalPhotoCount: number;
  peopleCount: number;
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

export function AppStatusBar({ statusMessage, status, view, librarySelectionCount, shownAssetsCount, peopleSelectionCount, totalPhotoCount, peopleCount, rightSlot }: AppStatusBarProps) {
  const dotColor = getStatusDotColor(statusMessage, status);
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
        <span style={{ color: statusMessage ? '#93c5fd' : undefined }}>{statusMessage ?? status}</span>
      </div>
      <div style={{ marginRight: 16 }}>{summary}</div>
      <div style={{ flexShrink: 0, opacity: 0.6 }}>v{metadata.version}</div>
      {rightSlot}
    </div>
  );
}