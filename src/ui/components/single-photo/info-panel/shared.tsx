import type React from 'react';
import { normalizeRatingPercent } from './ratingScale';


export const StarRating: React.FC<{ readonly value: number; readonly label: string }> = ({ value, label }) => {
  const pct = normalizeRatingPercent(value);
  const stars = Math.round((pct / 100) * 5);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-content-secondary min-w-[96px]">{label}</span>
      <span title={`${pct}%`} className="cursor-help tracking-wider">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={`text-sm ${i < stars ? 'text-amber-500' : 'text-content-secondary/30'}`}>{i < stars ? '★' : '☆'}</span>
        ))}
      </span>
      <span className="text-xs text-content-secondary">{pct}%</span>
    </div>
  );
};

export const Field: React.FC<{ readonly label: string; readonly value?: string | null; readonly mono?: boolean; readonly dim?: boolean }> = ({ label, value, mono, dim }) => {
  if (value == null || value === '' || value === 'Unknown') {
    return (
      <div className="flex gap-2 items-baseline pb-1.5">
        <span className="text-xs text-content-secondary/50 uppercase w-24 shrink-0">{label}</span>
        <span className="text-xs text-content-secondary italic">—</span>
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-baseline pb-1.5">
      <span className="text-xs text-content-secondary uppercase w-24 shrink-0">{label}</span>
      <span className={`text-xs leading-relaxed break-all select-text ${dim ? 'text-content-secondary' : 'text-content'} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
};

export const Section: React.FC<{ readonly emoji: string; readonly title: string; readonly children: React.ReactNode; readonly hideHeader?: boolean }> = ({ emoji, title, children, hideHeader }) => (
  <div className="mb-5">
    {!hideHeader && (
      <div className="flex items-center gap-1.5 border-b border-content/10 pb-1.5 mb-2.5">
        <span className="text-sm">{emoji}</span>
        <span className="text-xs font-bold uppercase text-content-secondary tracking-wider">{title}</span>
      </div>
    )}
    {children}
  </div>
);

export const Tag: React.FC<{ readonly text: string; readonly color?: string }> = ({ text, color }) => (
  <span 
    className="rounded-sm px-1.5 py-0.5 text-xs text-content-secondary inline-block m-0.5 ml-0"
    style={{ backgroundColor: color ?? 'rgba(99,102,241,0.15)', border: `1px solid ${color ? 'transparent' : 'rgba(99,102,241,0.2)'}` }}
  >
    {text}
  </span>
);

export const SourceHint: React.FC<{ readonly label?: string }> = ({ label }) => {
  if (!label) {
    return null;
  }

  return (
    <div 
      className="text-xs text-content-secondary -mt-0.5 mb-2" 
      style={{ paddingLeft: '104px' }}
    >
      {label}
    </div>
  );
};
