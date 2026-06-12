import { useState } from 'react';
import type React from 'react';
import type { Asset, ReviewItemSummary, TagDefinitionSummary } from '@contracts/core';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import { Field, Section, SourceHint, Tag } from './shared';
import { buildPhotoMetadataFileSummary } from './photoMetadataPanelModel';
import { PhotoDateReviewSection } from './PhotoDateReviewSection';
import { TagManagementSection } from './TagManagementSection';
import { shortPathDir } from './utils';

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
  return <Section emoji="💬" title="Caption"><p className="m-0 text-[13px] text-content leading-relaxed italic">&ldquo;{String(caption)}&rdquo;</p></Section>;
};

const KeywordsSection: React.FC<{ readonly keywords?: unknown }> = ({ keywords }) => {
  const items = Array.isArray(keywords) ? (keywords as string[]) : [];
  if (items.length === 0) {return null;}
  return <Section emoji="🏷️" title="Keywords"><div className="flex flex-wrap gap-1">{items.map((k, i) => <Tag key={i} text={k} />)}</div></Section>;
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
      {Boolean(asset.ai_metadata?._pending_pro) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded px-2.5 py-1.5 mt-1">
          <span className="text-[11px] text-amber-400 font-medium">⏳ Queued for enhanced pro analysis</span>
        </div>
      )}
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

const IdField: React.FC<{ readonly value: string; readonly filename: string }> = ({ value, filename }) => {
  const [copied, setCopied] = useState(false);
  const uppercaseValue = value.toUpperCase();
  const prefix = uppercaseValue.slice(0, -4);
  const suffix = uppercaseValue.slice(-4);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${value} (${filename})`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div 
      className="flex gap-2 items-baseline pb-1.5 cursor-pointer group select-none" 
      onClick={handleCopy} 
      title="Click to copy ID with filename"
    >
      <span className="text-xs text-content-secondary/90 font-bold w-24 shrink-0">ID</span>
      <span className="text-[11px] leading-snug text-content-secondary group-hover:text-brand-accent break-all select-text transition-colors flex items-center gap-1.5">
        <span>{prefix}</span>
        <span className="font-bold text-content group-hover:text-brand-accent">{suffix}</span>
        {copied && <span className="text-[9px] text-emerald-400 font-sans font-normal motion-safe:animate-pulse">Copied!</span>}
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
    <div className="flex gap-2 items-baseline pb-1.5">
      <span className="text-xs text-content-secondary/90 font-bold w-24 shrink-0">Photo Created</span>
      <span className="text-xs text-content leading-relaxed">{label}</span>
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
    <IdField value={asset.id} filename={filename} />
    <Field label="Name" value={filename} />
    <Field label="Path" value={shortPathDir(asset.original_path)} small dim />
    <Field label="Format" value={ext} />
    {asset.width && asset.height && <Field label="Dimensions" value={`${asset.width} × ${asset.height} px`} />}
    {asset.photo_created_at && <PhotoCreatedField value={asset.photo_created_at} />}
    {summary.estimatedDateRangeLabel && <Field label="Date Range" value={summary.estimatedDateRangeLabel} />}
    {asset.photo_created_at_confidence != null && <Field label="Date Confidence" value={`${Math.round(asset.photo_created_at_confidence * 100)}%`} />}
    {asset.exif_datetime && <Field label="Captured" value={new Date(asset.exif_datetime).toLocaleString()} />}
    {asset.metadata_timestamp_source && <Field label="Timestamp Source" value={asset.metadata_timestamp_source} />}
    {asset.created_at && <Field label="Imported" value={new Date(asset.created_at).toLocaleString()} />}
  </Section>
);
