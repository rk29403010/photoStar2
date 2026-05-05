import type React from 'react';
import type { Asset, ReviewItemSummary, TagDefinitionSummary } from '@contracts/core';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import { Field, Section, SourceHint, Tag } from './shared';
import { buildPhotoMetadataFileSummary } from './photoMetadataPanelModel';
import { PhotoDateReviewSection } from './PhotoDateReviewSection';
import { TagManagementSection } from './TagManagementSection';
import { shortPath } from './utils';

function getModelLabel(asset: Asset): string | undefined {
  const captionSource = asset.photo_metadata?.provenance?.caption?.sourceKind;
  if (captionSource === 'gemini_pro_refined') {return '✨ Pro refined';}
  if (captionSource === 'gemini_flash_scout') {return '⚡ Flash scout';}
  if (asset.ai_metadata?._analysis_tier === 'pro') {return '✨ Pro (3.1)';}
  if (asset.ai_metadata?._analysis_tier === 'flash') {return '⚡ Flash (3)';}
  return undefined;
}

const CaptionSection: React.FC<{ readonly caption?: unknown }> = ({ caption }) => {
  if (!caption) {return null;}
  return <Section emoji="💬" title="Caption"><p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.7, fontStyle: 'italic' }}>&ldquo;{String(caption)}&rdquo;</p></Section>;
};

const KeywordsSection: React.FC<{ readonly keywords?: unknown }> = ({ keywords }) => {
  const items = Array.isArray(keywords) ? (keywords as string[]) : [];
  if (items.length === 0) {return null;}
  return <Section emoji="🏷️" title="Keywords"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{items.map((k, i) => <Tag key={i} text={k} />)}</div></Section>;
};

function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(parsed);
}

const AiInterpretationSection: React.FC<{ readonly asset: Asset; readonly summary: ReturnType<typeof buildPhotoMetadataFileSummary>; readonly visible: boolean }> = ({ asset, summary, visible }) => {
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

const ResolvedMetadataSections: React.FC<{ readonly asset: Asset; readonly caption: string | null; readonly captionSourceLabel?: string }> = ({ asset, caption, captionSourceLabel }) => (
  <>
    <CaptionSection caption={caption} />
    <SourceHint label={captionSourceLabel} />
    <KeywordsSection keywords={asset.photo_metadata?.projection.keywords ?? asset.ai_metadata?.keywords} />
  </>
);

const IdField: React.FC<{ readonly value: string }> = ({ value }) => {
  const uppercaseValue = value.toUpperCase();
  const prefix = uppercaseValue.slice(0, -4);
  const suffix = uppercaseValue.slice(-4);

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', paddingBottom: 6 }}>
      <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', minWidth: 90, flexShrink: 0 }}>ID</span>
      <span style={{ color: '#e2e8f0', lineHeight: 1.4, fontFamily: '"Cascadia Code","Consolas",monospace', userSelect: 'text', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 10 }}>{prefix}</span>
        <span style={{ fontSize: 12 }}>{suffix}</span>
      </span>
    </div>
  );
};

const PhotoCreatedField: React.FC<{ readonly value: string }> = ({ value }) => {
  const label = formatDateOnly(value);
  if (!label) {
    return null;
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', paddingBottom: 6 }}>
      <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', minWidth: 90, flexShrink: 0 }}>Photo Created</span>
      <span style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>{label}</span>
    </div>
  );
};

export const FileTab: React.FC<{
  readonly asset: Asset;
  readonly availableTags?: TagDefinitionSummary[];
  readonly onAssignTag?: (tagLabel: string) => Promise<void>;
  readonly onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
  readonly onSetReviewItemStatus?: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
  readonly onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
}> = ({ asset, availableTags, onAssignTag, onRemoveTag, onSetReviewItemStatus, onFlagPhotoDateCorrection }) => {
  const filename = asset.original_path.split(/[/\\]/).pop() || '';
  const ext = filename.split('.').pop()?.toUpperCase() || '';
  const summary = buildPhotoMetadataFileSummary(asset);
  const hasPhotoMetadata = Boolean(asset.photo_metadata?.projection || asset.ai_metadata);

  return (
    <div>
      <FileSection asset={asset} filename={filename} ext={ext} summary={summary} />
      <AiInterpretationSection asset={asset} summary={summary} visible={hasPhotoMetadata} />
      <PhotoDateReviewSection asset={asset} onFlagPhotoDateCorrection={onFlagPhotoDateCorrection} />
      <ResolvedMetadataSections asset={asset} caption={summary.caption} captionSourceLabel={summary.captionSourceLabel} />
      <TagManagementSection
        asset={asset}
        availableTags={availableTags}
        onAssignTag={onAssignTag}
        onRemoveTag={onRemoveTag}
        onSetReviewItemStatus={onSetReviewItemStatus}
      />
    </div>
  );
};

const FileSection: React.FC<{ readonly asset: Asset; readonly filename: string; readonly ext: string; readonly summary: ReturnType<typeof buildPhotoMetadataFileSummary> }> = ({ asset, filename, ext, summary }) => (
  <Section emoji="📄" title="File" hideHeader>
    <IdField value={asset.id} />
    <Field label="Name" value={filename} />
    <Field label="Path" value={shortPath(asset.original_path)} mono dim />
    <Field label="Format" value={ext} />
    {asset.width && asset.height && <Field label="Dimensions" value={`${asset.width} × ${asset.height} px`} />}
    {asset.photo_created_at && <PhotoCreatedField value={asset.photo_created_at} />}
    {summary.estimatedDateRangeLabel && <Field label="Date Range" value={summary.estimatedDateRangeLabel} />}
    {asset.photo_created_at_confidence != null && <Field label="Date Confidence" value={`${Math.round(asset.photo_created_at_confidence * 100)}%`} />}
    {asset.exif_datetime && <Field label="Captured" value={new Date(asset.exif_datetime).toLocaleString()} />}
    {asset.metadata_timestamp_source && <Field label="Timestamp Source" value={asset.metadata_timestamp_source} mono />}
    {asset.created_at && <Field label="Imported" value={new Date(asset.created_at).toLocaleString()} />}
  </Section>
);
