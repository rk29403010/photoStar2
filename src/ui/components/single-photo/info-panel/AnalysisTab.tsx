import type React from 'react';
import type { Asset } from '@contracts/core';
import { Field, Section, StarRating, Tag } from './shared';
import { buildAnalysisDetails } from './analysisTabModel';

function getSensitivityColor(score: number | undefined): string {
  if (score == null) {return '#4b5563';}
  if (score >= 75) {return '#ef4444';}
  if (score >= 25) {return '#f59e0b';}
  return '#22c55e';
}

const QualitySection: React.FC<{ quality?: Record<string, unknown> }> = ({ quality }) => {
  if (!quality) {return null;}

  return (
    <Section emoji="⭐" title="Quality Scores">
      {quality.technical != null && <StarRating value={quality.technical as number} label="Technical" />}
      {quality.lighting != null && <StarRating value={quality.lighting as number} label="Lighting" />}
      {quality.composition != null && <StarRating value={quality.composition as number} label="Composition" />}
      {quality.emotional != null && <StarRating value={quality.emotional as number} label="Emotional" />}
      {quality.discard === true && <div style={{ marginTop: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#fca5a5' }}>🗑️ Suggested for discard</div>}
    </Section>
  );
};

const AuthenticitySection: React.FC<{ auth?: Record<string, unknown> }> = ({ auth }) => {
  if (!auth) {return null;}

  return (
    <Section emoji="🔎" title="Authenticity">
      {auth.score != null && <StarRating value={auth.score as number} label="Score" />}
      {Array.isArray(auth.reasons) && auth.reasons.length > 0 && (
        <ul style={{ margin: '8px 0 0', padding: '0 0 0 16px', fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>
          {(auth.reasons as string[]).map((reason, i) => <li key={i}>{reason}</li>)}
        </ul>
      )}
    </Section>
  );
};

const SensitivitySection: React.FC<{ asset: Asset }> = ({ asset }) => (
  <Section emoji="🛡️" title="Sensitivity">
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {asset.sensitivity_score != null ? (
        <>
          <span style={{ fontSize: 22, fontWeight: 700, color: getSensitivityColor(asset.sensitivity_score) }}>{Math.round(asset.sensitivity_score)}%</span>
          <div>
            <div style={{ fontSize: 11, color: '#64748b' }}>AI sensitivity score</div>
            {asset.sensitivity_status && <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: asset.sensitivity_status === 'safe' ? '#4ade80' : asset.sensitivity_status === 'unsafe' ? '#ef4444' : '#f59e0b' }}>Manual: {asset.sensitivity_status}</span>}
          </div>
        </>
      ) : (
        <span style={{ fontSize: 12, color: '#374151', fontStyle: 'italic' }}>Not yet scored</span>
      )}
    </div>
  </Section>
);

const EnhancementsSection: React.FC<{ enhancements?: unknown }> = ({ enhancements }) => {
  const items = Array.isArray(enhancements) ? (enhancements as string[]) : [];
  if (items.length === 0) {return null;}

  return (
    <Section emoji="✨" title="Recommended Enhancements">
      <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: '#94a3b8', lineHeight: 1.9 }}>
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </Section>
  );
};

const AnalysisSummarySection: React.FC<{ asset: Asset }> = ({ asset }) => {
  const details = buildAnalysisDetails(asset);
  const hasDetails = Boolean(details.mode || details.caption || details.notes || details.tags.length > 0);
  if (!hasDetails) {return null;}

  return (
    <Section emoji="🧠" title="Analysis Summary">
      <Field label="Mode" value={details.mode} />
      {details.caption && (
        <div style={{ paddingBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Caption</div>
          <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.6, fontStyle: 'italic' }}>&ldquo;{details.caption}&rdquo;</div>
        </div>
      )}
      {details.notes && (
        <div style={{ paddingBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Notes</div>
          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>{details.notes}</div>
        </div>
      )}
      {details.tags.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {details.tags.map((tag) => <Tag key={tag} text={tag} />)}
          </div>
        </div>
      )}
    </Section>
  );
};

export const AnalysisTab: React.FC<{ asset: Asset }> = ({ asset }) => {
  const ai = asset.ai_metadata;
  const quality = ai?.quality as Record<string, unknown> | undefined;
  const auth = ai?.authenticity as Record<string, unknown> | undefined;
  const analysisDetails = buildAnalysisDetails(asset);
  const hasAnalysisContent = Boolean(
    ai
    || asset.sensitivity_score != null
    || analysisDetails.mode
    || analysisDetails.caption
    || analysisDetails.notes
    || analysisDetails.tags.length > 0
  );

  return (
    <div>
      <AnalysisSummarySection asset={asset} />
      <QualitySection quality={quality} />
      <AuthenticitySection auth={auth} />
      <SensitivitySection asset={asset} />
      <EnhancementsSection enhancements={ai?.recommended_enhancements} />

      {!hasAnalysisContent && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#374151' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🤔</div>
          <div style={{ fontSize: 13 }}>No analysis yet</div>
          <div style={{ fontSize: 11, color: '#1e293b', marginTop: 4 }}>Use Actions → Analyze Image</div>
        </div>
      )}
    </div>
  );
};
