import type { ReactNode } from 'react';
import metadata from '../../../../metadata.json';
import type { CurrentPhotoStatus } from '@shared/utils/libraryGallery';
import type { StatusBanner } from './statusBannerModel';

type AppStatusBarProps = {
  readonly statusBanner: StatusBanner | null;
  readonly activityMessage?: string | null;
  readonly status: string;
  readonly view: 'library' | 'people' | 'familyTree' | 'dashboard' | 'albums' | 'reviews' | 'vocabulary' | 'workflows' | 'groupDiagnostics';
  readonly librarySelectionCount: number;
  readonly shownAssetsCount: number;
  readonly peopleSelectionCount: number;
  readonly totalPhotoCount: number;
  readonly peopleCount: number;
  readonly currentPhoto?: CurrentPhotoStatus | null;
  readonly rightSlot?: ReactNode;
}

function getStatusDotColorClass(statusBanner: StatusBanner | null, status: string): string {
  if (statusBanner) {
    return 'text-blue-400';
  }

  return status.toLowerCase().includes('error') ? 'text-red-500' : 'text-emerald-500';
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
      className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-content/5 text-content-secondary motion-safe:animate-[statusBarCurrentPhotoEnter_0.18s_ease-out]"
    >
      <span className="text-brand-accent text-[11px] tracking-wider uppercase">Current photo</span>
      <span className="text-content font-medium">{currentPhoto.filename}</span>
      <span>{currentPhoto.sensitivity}</span>
      {currentPhoto.dimensions && <span>{currentPhoto.dimensions}</span>}
    </div>
  );
}

export function AppStatusBar({ statusBanner, activityMessage, status, view, librarySelectionCount, shownAssetsCount, peopleSelectionCount, totalPhotoCount, peopleCount, currentPhoto, rightSlot }: AppStatusBarProps) {
  const displayedStatus = statusBanner?.message ?? activityMessage ?? status;
  const dotColorClass = getStatusDotColorClass(displayedStatus === status ? null : statusBanner, status);
  const summary = buildStatusSummary(view, {
    librarySelectionCount,
    shownAssetsCount,
    peopleSelectionCount,
    totalPhotoCount,
    peopleCount,
  });

  return (
    <div
      className="h-7 bg-surface-secondary border-t border-content/10 flex items-center px-2.5 text-xs text-content-secondary shrink-0 gap-3"
    >
      <div className="flex-1 flex items-center">
        <span className={`mr-2 ${dotColorClass}`}>●</span>
        <span className={displayedStatus !== status ? 'text-brand-accent font-medium' : ''}>{displayedStatus}</span>
        {statusBanner?.actionLabel && statusBanner.onAction && (
          <button
            type="button"
            onClick={statusBanner.onAction}
            className="ml-2.5 border border-brand-accent/30 bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20 rounded-full cursor-pointer text-[11px] px-2.5 py-0.5 transition-colors"
          >
            {statusBanner?.actionLabel}
          </button>
        )}
      </div>
      <div className="mr-4">{summary}</div>
      {currentPhoto && <CurrentPhotoSegment currentPhoto={currentPhoto} />}
      {rightSlot}
      <div className="shrink-0 opacity-60">v{metadata.version}</div>
      <style>{`
        @keyframes statusBarCurrentPhotoEnter {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
