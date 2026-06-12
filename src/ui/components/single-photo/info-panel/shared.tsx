import type React from 'react';
import { normalizeRatingPercent } from './ratingScale';


function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const StarRating: React.FC<{ readonly value: number; readonly label: string }> = ({ value, label }) => {
  const pct = normalizeRatingPercent(value);
  const stars = Math.round((pct / 100) * 5);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-bold text-content-secondary w-24 shrink-0">{toTitleCase(label)}</span>
      <span title={`${pct}%`} className="cursor-help tracking-wider">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={`text-sm ${i < stars ? 'text-amber-500' : 'text-content-secondary/35'}`}>{i < stars ? '★' : '☆'}</span>
        ))}
      </span>
      <span className="text-xs text-content-secondary">{pct}%</span>
    </div>
  );
};

export const Field: React.FC<{ readonly label: string; readonly value?: string | null; readonly dim?: boolean; readonly small?: boolean }> = ({ label, value, dim, small }) => {
  const titleCaseLabel = toTitleCase(label);
  if (value == null || value === '' || value === 'Unknown') {
    return (
      <div className="flex gap-2 items-baseline pb-1.5">
        <span className="text-xs text-content-secondary/60 font-bold w-24 shrink-0">{titleCaseLabel}</span>
        <span className="text-xs text-content-secondary/80 italic">—</span>
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-baseline pb-1.5">
      <span className="text-xs text-content-secondary/90 font-bold w-24 shrink-0">{titleCaseLabel}</span>
      <span className={`leading-relaxed break-all select-text ${dim ? 'text-content-secondary/80' : 'text-content'} ${small ? 'text-[11px]' : 'text-xs'}`}>{value}</span>
    </div>
  );
};

export const Section: React.FC<{ readonly emoji: string; readonly title: string; readonly children: React.ReactNode; readonly hideHeader?: boolean }> = ({ emoji, title, children, hideHeader }) => (
  <div className="mb-5">
    {!hideHeader && (
      <div className="flex items-center gap-1.5 border-b border-content/10 pb-1.5 mb-2.5">
        <span className="text-sm">{emoji}</span>
        <span className="text-xs font-bold uppercase text-content tracking-wider">{title.toUpperCase()}</span>
      </div>
    )}
    {children}
  </div>
);

export const Tag: React.FC<{ readonly text: string; readonly color?: string; readonly isPending?: boolean }> = ({ text, color, isPending }) => {
  let bgClass = 'bg-indigo-500/15 border-indigo-500/20 text-indigo-300';
  if (isPending) {
    bgClass = 'bg-amber-500/10 border-amber-500/30 text-amber-300';
  } else if (color) {
    bgClass = '';
  }
  
  return (
    <span 
      className={`rounded px-2 py-0.5 text-xs inline-block m-0.5 ml-0 border ${bgClass} text-content font-medium`}
      style={color ? { backgroundColor: color, borderColor: 'transparent' } : undefined}
    >
      {text}
    </span>
  );
};

export const SourceHint: React.FC<{ readonly label?: string }> = ({ label }) => {
  if (!label) {
    return null;
  }

  return (
    <div className="text-xs text-content-secondary/70 -mt-0.5 mb-2 pl-26">
      {label}
    </div>
  );
};
