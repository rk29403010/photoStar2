import type React from 'react';
import { normalizeRatingPercent } from './ratingScale';


export const StarRating: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const pct = normalizeRatingPercent(value);
  const stars = Math.round((pct / 100) * 5);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 60 }}>{label}</span>
      <span title={`${pct}%`} style={{ cursor: 'help', letterSpacing: 1 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ color: i < stars ? '#f59e0b' : '#374151', fontSize: 14 }}>{i < stars ? '★' : '☆'}</span>
        ))}
      </span>
      <span style={{ fontSize: 10, color: '#64748b' }}>{pct}%</span>
    </div>
  );
};

export const Field: React.FC<{ label: string; value?: string | null; mono?: boolean; dim?: boolean }> = ({ label, value, mono, dim }) => {
  if (value == null || value === '' || value === 'Unknown') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', paddingBottom: 6 }}>
        <span style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', minWidth: 90, flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 12, color: '#374151', fontStyle: 'italic' }}>—</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', paddingBottom: 6 }}>
      <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', minWidth: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: dim ? '#64748b' : '#e2e8f0', lineHeight: 1.5, fontFamily: mono ? '"Cascadia Code","Consolas",monospace' : undefined, wordBreak: 'break-word', userSelect: 'text' }}>{value}</span>
    </div>
  );
};

export const Section: React.FC<{ emoji: string; title: string; children: React.ReactNode; hideHeader?: boolean }> = ({ emoji, title, children, hideHeader }) => (
  <div style={{ marginBottom: 20 }}>
    {!hideHeader && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #1e293b', paddingBottom: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>{emoji}</span>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: 1 }}>{title}</span>
      </div>
    )}
    {children}
  </div>
);

export const Tag: React.FC<{ text: string; color?: string }> = ({ text, color = '#3b4a6b' }) => (
  <span style={{ background: color, borderRadius: 4, padding: '2px 7px', fontSize: 11, color: '#cbd5e1', display: 'inline-block', margin: '2px 2px 2px 0' }}>{text}</span>
);

export const SourceHint: React.FC<{ label?: string }> = ({ label }) => {
  if (!label) {
    return null;
  }

  return <div style={{ fontSize: 10, color: '#64748b', marginTop: -2, marginBottom: 8, paddingLeft: 98 }}>{label}</div>;
};
