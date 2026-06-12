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
      {quality.discard === true && <div className="mt-2 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2 text-xs text-rose-300">🗑️ Suggested for discard</div>}
    </Section>
  );
};

const AuthenticitySection: React.FC<{ readonly auth?: Record<string, unknown> }> = ({ auth }) => {
  if (!auth) {return null;}

  return (
    <Section emoji="🔎" title="Authenticity">
      {auth.score != null && <StarRating value={auth.score as number} label="Score" />}
      {Array.isArray(auth.reasons) && auth.reasons.length > 0 && (
        <ul className="m-0 mt-2 pl-4 text-xs text-content-secondary leading-relaxed list-disc">
          {(auth.reasons as string[]).map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
    </Section>
  );
};

const SensitivitySection: React.FC<{ readonly asset: Asset }> = ({ asset }) => (
  <Section emoji="🛡️" title="Sensitivity">
    <div className="flex items-center gap-2.5">
      {asset.sensitivity_score == null ? (
        <span className="text-xs text-content-secondary/60 italic">Not yet scored</span>
      ) : (
        <>
          <span className="text-2xl font-bold" style={{ color: getSensitivityColor(asset.sensitivity_score) }}>{Math.round(asset.sensitivity_score)}%</span>
          <div>
            <div className="text-[11px] text-content-secondary">AI sensitivity score</div>
            {asset.sensitivity_status && (
              <span className="text-[11px] font-bold uppercase" style={{
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
      <ul className="m-0 pl-4 text-xs text-content-secondary leading-relaxed list-disc">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </Section>
  );
};

const DescriptionSection: React.FC<{ readonly description: string; readonly sourceLabel?: string }> = ({ description, sourceLabel }) => (
  <Section emoji="📝" title="Description">
    <div className="text-xs text-content leading-relaxed">{description}</div>
    <SourceHint label={sourceLabel} />
  </Section>
);

const InterpretationSection: React.FC<{ readonly emotionalImpact: string; readonly sourceLabel?: string }> = ({ emotionalImpact, sourceLabel }) => (
  <Section emoji="💖" title="Emotional Impact">
    <div className="text-xs text-content leading-relaxed">{emotionalImpact}</div>
    <SourceHint label={sourceLabel} />
  </Section>
);

const EmptyAnalysisState: React.FC = () => (
  <div className="text-center py-10 px-5 text-content-secondary/60">
    <div className="text-3xl mb-2.5">🤔</div>
    <div className="text-xs font-bold uppercase text-content-secondary/80">No Analysis Yet</div>
    <div className="text-[11px] text-content-secondary/70 mt-1">Use Actions → Quick Analysis or Detailed Analysis</div>
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
          <div className="text-[10px] text-content-secondary font-bold uppercase mb-1">Tags</div>
          <div className="flex flex-wrap gap-1">
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
