import type React from 'react';
import type { Asset } from '@contracts/core';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import { Field, Section, SourceHint, Tag } from './shared';
import { buildPhotoMetadataFileSummary } from './photoMetadataPanelModel';
import { PhotoDateReviewSection } from './PhotoDateReviewSection';
import { shortPath } from './utils';

function getModelLabel(asset: Asset): string | undefined {
  const captionSource = asset.photo_metadata?.provenance?.caption?.sourceKind;
  if (captionSource === 'gemini_pro_refined') {return '✨ Pro refined';}
  if (captionSource === 'gemini_flash_scout') {return '⚡ Flash scout';}
  if (asset.ai_metadata?._analysis_tier === 'pro') {return '✨ Pro (3.1)';}
  if (asset.ai_metadata?._analysis_tier === 'flash') {return '⚡ Flash (3)';}
  return undefined;
}

const CaptionSection: React.FC<{ caption?: unknown }> = ({ caption }) => {
  if (!caption) {return null;}
  return <Section emoji="💬" title="Caption"><p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.7, fontStyle: 'italic' }}>&ldquo;{String(caption)}&rdquo;</p></Section>;
};

const KeywordsSection: React.FC<{ keywords?: unknown }> = ({ keywords }) => {
  const items = Array.isArray(keywords) ? (keywords as string[]) : [];
  if (items.length === 0) {return null;}
  return <Section emoji="🏷️" title="Keywords"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{items.map((k, i) => <Tag key={i} text={k} />)}</div></Section>;
};

const EmotionalSection: React.FC<{ emotional?: unknown }> = ({ emotional }) => {
  if (!emotional) {return null;}
  return <Section emoji="💖" title="Emotional Impact"><p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>{String(emotional)}</p></Section>;
};

const AiInterpretationSection: React.FC<{ asset: Asset; summary: ReturnType<typeof buildPhotoMetadataFileSummary>; visible: boolean }> = ({ asset, summary, visible }) => {
  if (!visible) {return null;}

  return (
    <Section emoji="🤖" title="AI Interpretation">
      <Field label="Type" value={summary.type} />
      <SourceHint label={summary.typeSourceLabel} />
      <Field label="Est. Date" value={summary.estimatedDateLabel} />
      <SourceHint label={summary.estimatedDateSourceLabel} />
      <Field label="Location" value={summary.location} />
      <SourceHint label={summary.locationSourceLabel} />
      <Field label="Model" value={getModelLabel(asset)} />
      {Boolean(asset.ai_metadata?._pending_pro) && <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}><span style={{ fontSize: 11, color: '#fbbf24' }}>⏳ Queued for enhanced pro analysis</span></div>}
    </Section>
  );
};

const ResolvedMetadataSections: React.FC<{ asset: Asset; caption: string | null; captionSourceLabel?: string }> = ({ asset, caption, captionSourceLabel }) => (
  <>
    <CaptionSection caption={caption} />
    <SourceHint label={captionSourceLabel} />
    <KeywordsSection keywords={asset.photo_metadata?.projection.keywords ?? asset.ai_metadata?.keywords} />
    <EmotionalSection emotional={asset.photo_metadata?.projection.emotionalImpact ?? asset.ai_metadata?.emotional_impact} />
  </>
);

export const FileTab: React.FC<{ asset: Asset; onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void> }> = ({ asset, onFlagPhotoDateCorrection }) => {
  const filename = asset.original_path.split(/[/\\]/).pop() || '';
  const ext = filename.split('.').pop()?.toUpperCase() || '';
  const summary = buildPhotoMetadataFileSummary(asset);
  const hasPhotoMetadata = Boolean(asset.photo_metadata?.projection || asset.ai_metadata);

  return (
    <div>
      <FileSection asset={asset} filename={filename} ext={ext} />
      <AiInterpretationSection asset={asset} summary={summary} visible={hasPhotoMetadata} />
      <PhotoDateReviewSection asset={asset} onFlagPhotoDateCorrection={onFlagPhotoDateCorrection} />
      <ResolvedMetadataSections asset={asset} caption={summary.caption} captionSourceLabel={summary.captionSourceLabel} />
    </div>
  );
};

const FileSection: React.FC<{ asset: Asset; filename: string; ext: string }> = ({ asset, filename, ext }) => (
  <Section emoji="📄" title="File">
    <Field label="ID" value={asset.id} mono />
    <Field label="Name" value={filename} />
    <Field label="Path" value={shortPath(asset.original_path)} mono dim />
    <Field label="Format" value={ext} />
    {asset.width && asset.height && <Field label="Dimensions" value={`${asset.width} × ${asset.height} px`} />}
    {asset.photo_created_at && <Field label="Photo Created" value={new Date(asset.photo_created_at).toLocaleString()} />}
    {asset.photo_created_at_confidence != null && <Field label="Date Confidence" value={`${Math.round(asset.photo_created_at_confidence * 100)}%`} />}
    {asset.exif_datetime && <Field label="Captured" value={new Date(asset.exif_datetime).toLocaleString()} />}
    {asset.metadata_timestamp_source && <Field label="Timestamp Source" value={asset.metadata_timestamp_source} mono />}
    {asset.created_at && <Field label="Imported" value={new Date(asset.created_at).toLocaleString()} />}
  </Section>
);
