import type React from 'react';
import type { Asset } from '@contracts/core';
import { Section, Tag } from './shared';
import {
  buildSinglePhotoPeopleModel,
  getSinglePhotoPeopleColor,
  type SinglePhotoPeopleItem,
} from '../singlePhotoPeopleModel';

type PeopleTabProps = {
  readonly asset: Asset;
  readonly hoveredFaceKey?: string | null;
  readonly onHoverFaceKey?: (key: string | null) => void;
}

const EmptyPeopleState: React.FC = () => (
  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#374151' }}>
    <div style={{ fontSize: 32, marginBottom: 10 }}>👤</div>
    <div style={{ fontSize: 13 }}>No people or region data yet</div>
    <div style={{ fontSize: 11, color: '#1e293b', marginTop: 4 }}>Run face detection and AI analysis to identify people and scout regions</div>
  </div>
);

const OverlayCard: React.FC<{
  readonly item: SinglePhotoPeopleItem;
  readonly hoveredFaceKey?: string | null;
  readonly onHoverFaceKey?: (key: string | null) => void;
}> = ({ item, hoveredFaceKey, onHoverFaceKey }) => {
  const isHovered = hoveredFaceKey === item.key;
  const colors = getSinglePhotoPeopleColor(item.kind);

  return (
    <div
      onMouseEnter={() => onHoverFaceKey?.(item.key)}
      onMouseLeave={() => onHoverFaceKey?.(null)}
      style={{
        background: isHovered ? colors.panelBackgroundHover : colors.panelBackground,
        border: `1px solid ${isHovered ? colors.panelBorderHover : colors.panelBorder}`,
        borderRadius: 8,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
        boxShadow: isHovered ? `0 0 0 1px ${colors.panelBorderHover}, 0 0 10px rgba(${colors.glowRgb},0.2)` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{item.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: colors.panelText, fontWeight: 600 }}>{item.label}</div>
          {item.detail && <div style={{ fontSize: 10, color: colors.panelMutedText }}>{item.detail}</div>}
        </div>
        <span style={{ fontSize: 10, color: isHovered ? colors.panelText : '#64748b' }}>📍 {isHovered ? 'on image' : 'has box'}</span>
      </div>
      {(item.tags.length > 0 || item.sourceLabel) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {item.tags.map((tag) => <Tag key={`${item.key}-${tag}`} text={tag} color={colors.chipBackground} />)}
          {item.sourceLabel && <Tag text={item.sourceLabel} color={colors.chipBackground} />}
        </div>
      )}
    </div>
  );
};

const OverlaySection: React.FC<{
  readonly emoji: string;
  readonly title: string;
  readonly items: SinglePhotoPeopleItem[];
  readonly hoveredFaceKey?: string | null;
  readonly onHoverFaceKey?: (key: string | null) => void;
}> = ({ emoji, title, items, hoveredFaceKey, onHoverFaceKey }) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <Section emoji={emoji} title={title} hideHeader={title === 'People'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <OverlayCard key={item.key} item={item} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} />
        ))}
      </div>
    </Section>
  );
};

export const PeopleTab: React.FC<PeopleTabProps> = ({ asset, hoveredFaceKey, onHoverFaceKey }) => {
  const model = buildSinglePhotoPeopleModel(asset);
  const resolvedPeople = model.peopleItems.filter((item) => item.kind === 'resolved-person');
  const localDetections = model.peopleItems.filter((item) => item.kind === 'local-face');
  const remoteSubjects = model.peopleItems.filter((item) => item.kind === 'remote-subject');

  if (model.peopleItems.length === 0 && model.regionsOfInterest.length === 0) {
    return <EmptyPeopleState />;
  }

  return (
    <div>
      <OverlaySection emoji="🙂" title="People" items={resolvedPeople} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} />
      <OverlaySection emoji="👤" title="Local Detections" items={localDetections} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} />
      <OverlaySection emoji="🤖" title="Remote AI Subjects" items={remoteSubjects} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} />
      <OverlaySection emoji="🧭" title="Regions of Interest" items={model.regionsOfInterest} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} />
    </div>
  );
};
