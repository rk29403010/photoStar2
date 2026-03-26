import type React from 'react';
import type { Asset } from '@contracts/core';
import { Field, Section, Tag } from './shared';
import { shortPath } from './utils';

function getModelLabel(asset: Asset): string | undefined {
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

export const FileTab: React.FC<{ asset: Asset }> = ({ asset }) => {
    const filename = asset.original_path.split(/[/\\]/).pop() || '';
    const ext = filename.split('.').pop()?.toUpperCase() || '';
    const ai = asset.ai_metadata;

    return (
        <div>
      <FileSection asset={asset} filename={filename} ext={ext} />

      {ai && (
        <Section emoji="🤖" title="AI Interpretation">
          <Field label="Type" value={ai.type as string} />
          <Field label="Est. Date" value={ai.estimated_date as string} />
          <Field label="Location" value={ai.location as string} />
          <Field label="Model" value={getModelLabel(asset)} />
          {Boolean(asset.ai_metadata?._pending_pro) && <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}><span style={{ fontSize: 11, color: '#fbbf24' }}>⏳ Queued for enhanced pro analysis</span></div>}
        </Section>
      )}

      <CaptionSection caption={ai?.caption} />
      <KeywordsSection keywords={ai?.keywords} />
      <EmotionalSection emotional={ai?.emotional_impact} />
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
