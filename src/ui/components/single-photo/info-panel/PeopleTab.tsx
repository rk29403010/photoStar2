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
  <div className="text-center py-10 px-5 text-content-secondary/60">
    <div className="text-3xl mb-2.5">👤</div>
    <div className="text-xs font-bold uppercase text-content-secondary/80">No people or region data yet</div>
    <div className="text-[11px] text-content-secondary/70 mt-1">Run face detection and AI analysis to identify people and scout regions</div>
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
      className="rounded-lg p-3 flex flex-col gap-1.5 motion-safe:transition-all duration-150"
      style={{
        background: isHovered ? colors.panelBackgroundHover : colors.panelBackground,
        border: `1px solid ${isHovered ? colors.panelBorderHover : colors.panelBorder}`,
        boxShadow: isHovered ? `0 0 0 1px ${colors.panelBorderHover}, 0 0 10px rgba(${colors.glowRgb},0.2)` : 'none',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{item.icon}</span>
        <div className="flex-1">
          <div className="text-xs font-bold" style={{ color: colors.panelText }}>{item.label}</div>
          {item.detail && <div className="text-[10px]" style={{ color: colors.panelMutedText }}>{item.detail}</div>}
        </div>
        <span className="text-[10px]" style={{ color: isHovered ? colors.panelText : '#64748b' }}>📍 {isHovered ? 'on image' : 'has box'}</span>
      </div>
      {(item.tags.length > 0 || item.sourceLabel) && (
        <div className="flex flex-wrap gap-1">
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
      <div className="flex flex-col gap-2">
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
