import type React from 'react';
import type { Asset, PhotoMetadataProjection } from '@contracts/core';
import { Field, Section, SourceHint, StarRating, Tag } from './shared';
import { buildAnalysisDetails } from './analysisTabModel';
import { buildPhotoMetadataAnalysisSummary } from './photoMetadataPanelModel';

function getSensitivityColor(score: number | undefined): string {
  if (score == null) {return '#4b5563';}
  if (score >= 75) {return '#ef4444';}
  if (score >= 25) {return '#f59e0b';}
  return '#22c55e';
}

const QualitySection: React.FC<{ readonly quality?: Record<string, unknown> }> = ({ quality }) => {
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

const AuthenticitySection: React.FC<{ readonly auth?: Record<string, unknown> }> = ({ auth }) => {
  if (!auth) {return null;}

  return (
    <Section emoji="🔎" title="Authenticity">
      {auth.score != null && <StarRating value={auth.score as number} label="Score" />}
      {Array.isArray(auth.reasons) && auth.reasons.length > 0 && (
        <ul style={{ margin: '8px 0 0', padding: '0 0 0 16px', fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>
          {(auth.reasons as string[]).map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
    </Section>
  );
};

const SensitivitySection: React.FC<{ readonly asset: Asset }> = ({ asset }) => (
  <Section emoji="🛡️" title="Sensitivity">
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {asset.sensitivity_score == null ? (
        <span style={{ fontSize: 12, color: '#374151', fontStyle: 'italic' }}>Not yet scored</span>
      ) : (
        <>
          <span style={{ fontSize: 22, fontWeight: 700, color: getSensitivityColor(asset.sensitivity_score) }}>{Math.round(asset.sensitivity_score)}%</span>
          <div>
            <div style={{ fontSize: 11, color: '#64748b' }}>AI sensitivity score</div>
            {asset.sensitivity_status && (
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: (function () {
                  if (asset.sensitivity_status === 'safe') {return '#4ade80';}
                  if (asset.sensitivity_status === 'unsafe') {return '#ef4444';}
                  return '#f59e0b';
                }())
              }}>
                Manual: {asset.sensitivity_status}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  </Section>
);

const EnhancementsSection: React.FC<{ readonly enhancements?: unknown }> = ({ enhancements }) => {
  const items = Array.isArray(enhancements) ? (enhancements as string[]) : [];
  if (items.length === 0) {return null;}

  return (
    <Section emoji="✨" title="Recommended Enhancements">
      <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: '#94a3b8', lineHeight: 1.9 }}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </Section>
  );
};

const DescriptionSection: React.FC<{ readonly description: string; readonly sourceLabel?: string }> = ({ description, sourceLabel }) => (
  <Section emoji="📝" title="Description">
    <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.7 }}>{description}</div>
    <SourceHint label={sourceLabel} />
  </Section>
);

const InterpretationSection: React.FC<{ readonly emotionalImpact: string; readonly sourceLabel?: string }> = ({ emotionalImpact, sourceLabel }) => (
  <Section emoji="💖" title="Emotional Impact">
    <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.7 }}>{emotionalImpact}</div>
    <SourceHint label={sourceLabel} />
  </Section>
);

const EmptyAnalysisState: React.FC = () => (
  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#374151' }}>
    <div style={{ fontSize: 32, marginBottom: 10 }}>🤔</div>
    <div style={{ fontSize: 13 }}>No analysis yet</div>
    <div style={{ fontSize: 11, color: '#1e293b', marginTop: 4 }}>Use Actions → Quick Analysis or Detailed Analysis</div>
  </div>
);

function hasAnalysisContent(params: {
  ai: Asset['ai_metadata'];
  projection: PhotoMetadataProjection | undefined;
  sensitivityScore: number | null | undefined;
  details: ReturnType<typeof buildAnalysisDetails>;
}) {
  return params.ai != null
    || params.projection != null
    || params.sensitivityScore != null
    || params.details.mode != null
    || params.details.description != null
    || params.details.tags.length > 0;
}

const AnalysisSummarySection: React.FC<{ readonly asset: Asset }> = ({ asset }) => {
  const details = buildAnalysisDetails(asset);
  const hasDetails = Boolean(details.mode || details.tags.length > 0);
  if (!hasDetails) {return null;}

  return (
    <Section emoji="🧠" title="Analysis Summary" hideHeader>
      <Field label="Mode" value={details.mode} />
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

function getQualitySummary(projection: PhotoMetadataProjection | undefined, ai: Asset['ai_metadata']) {
  return (projection?.quality as Record<string, unknown> | undefined) ?? (ai?.quality as Record<string, unknown> | undefined);
}

function getAuthenticitySummary(projection: PhotoMetadataProjection | undefined, ai: Asset['ai_metadata']) {
  return (projection?.authenticity as Record<string, unknown> | undefined) ?? (ai?.authenticity as Record<string, unknown> | undefined);
}

function getEnhancementSummary(projection: PhotoMetadataProjection | undefined, ai: Asset['ai_metadata']) {
  return projection?.recommendedEnhancements ?? ai?.recommended_enhancements;
}

function getAnalysisContent(asset: Asset) {
  const projection = asset.photo_metadata?.projection;
  const ai = asset.ai_metadata;
  const analysisDetails = buildAnalysisDetails(asset);
  const summary = buildPhotoMetadataAnalysisSummary(asset);
  const analysisVisible = hasAnalysisContent({
    ai,
    projection,
    sensitivityScore: asset.sensitivity_score,
    details: analysisDetails,
  });

  return {
    summary,
    quality: getQualitySummary(projection, ai),
    authenticity: getAuthenticitySummary(projection, ai),
    enhancements: getEnhancementSummary(projection, ai),
    hasAnalysisContent: analysisVisible,
  };
}

export const AnalysisTab: React.FC<{ readonly asset: Asset }> = ({ asset }) => {
  const content = getAnalysisContent(asset);

  return (
    <div>
      <AnalysisSummarySection asset={asset} />
      {content.summary.description && <DescriptionSection description={content.summary.description} sourceLabel={content.summary.descriptionSourceLabel} />}
      {content.summary.emotionalImpact && <InterpretationSection emotionalImpact={content.summary.emotionalImpact} sourceLabel={content.summary.emotionalImpactSourceLabel} />}
      <QualitySection quality={content.quality} />
      <AuthenticitySection auth={content.authenticity} />
      <SensitivitySection asset={asset} />
      <EnhancementsSection enhancements={content.enhancements} />
      {!content.hasAnalysisContent && <EmptyAnalysisState />}
    </div>
  );
};
