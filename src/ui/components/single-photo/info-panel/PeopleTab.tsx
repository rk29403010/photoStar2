import type React from 'react';
import { useEffect, useState } from 'react';
import type { Asset } from '@contracts/core';
import { globalRequest } from '@ui/hooks/usePhotoLibrary';
import { resolveImageUrl } from '@boundary/runtime/backend';
import { Section, Tag } from './shared';
import {
  buildSinglePhotoPeopleModel,
  getSinglePhotoPeopleColor,
  type SinglePhotoPeopleItem,
  type SinglePhotoOverlayBox,
} from '../singlePhotoPeopleModel';

type PeopleTabProps = {
  readonly asset: Asset;
  readonly hoveredFaceKey?: string | null;
  readonly onHoverFaceKey?: (key: string | null) => void;
  readonly selectedOverlayKey?: string | null;
  readonly onSelectOverlayKey?: (key: string | null) => void;
}

const EmptyPeopleState: React.FC = () => (
  <div className="text-center py-10 px-5 text-content-secondary/60">
    <div className="text-3xl mb-2.5">👤</div>
    <div className="text-xs font-bold uppercase text-content-secondary/80">No people or region data yet</div>
    <div className="text-[11px] text-content-secondary/70 mt-1">Run face detection and AI analysis to identify people and scout regions</div>
  </div>
);

type LinkInfo = {
  person_id: string;
  gedcom_tree_id: string;
  gedcom_person_id: string;
};

type TreeInfo = {
  id: string;
  filename: string;
  version_label: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === 'string' ? field : null;
}

function readTreeInfo(value: unknown): TreeInfo | null {
  if (!isRecord(value)) { return null; }
  const id = readStringField(value, 'id');
  const filename = readStringField(value, 'filename');
  const versionLabel = readStringField(value, 'version_label');
  return id && filename && versionLabel ? { id, filename, version_label: versionLabel } : null;
}

function readLinkInfo(value: unknown): LinkInfo | null {
  if (!isRecord(value)) { return null; }
  const personId = readStringField(value, 'person_id');
  const treeId = readStringField(value, 'gedcom_tree_id');
  const gedcomPersonId = readStringField(value, 'gedcom_person_id');
  return personId && treeId && gedcomPersonId
    ? { person_id: personId, gedcom_tree_id: treeId, gedcom_person_id: gedcomPersonId }
    : null;
}

function readResponseItems<T>(value: unknown, key: string, parseItem: (item: unknown) => T | null): T[] {
  if (!isRecord(value) || !Array.isArray(value[key])) { return []; }
  return value[key].flatMap((item) => {
    const parsedItem = parseItem(item);
    return parsedItem ? [parsedItem] : [];
  });
}

function getCardStyle(isHovered: boolean, colors: ReturnType<typeof getSinglePhotoPeopleColor>) {
  return {
    background: isHovered ? colors.panelBackgroundHover : colors.panelBackground,
    border: `1px solid ${isHovered ? colors.panelBorderHover : colors.panelBorder}`,
    boxShadow: isHovered ? `0 0 0 1px ${colors.panelBorderHover}, 0 0 10px rgba(${colors.glowRgb},0.2)` : 'none',
  };
}

function getThumbnailUrl(asset: Asset) {
  return asset.preview_data_url ?? resolveImageUrl(asset.preview_path ?? asset.original_path);
}

function shouldShowThumbnail(imgUrl: string | null, box: SinglePhotoOverlayBox | undefined): boolean {
  if (!imgUrl || !box) { return false; }
  return box.w > 0 && box.h > 0;
}

function getPersonLinks(raw: unknown, links: LinkInfo[]): LinkInfo[] {
  const personId = isRecord(raw) ? readStringField(raw, 'person_id') : null;
  if (!personId) { return []; }
  return links.filter(l => l.person_id === personId);
}

const CardThumbnail: React.FC<{
  readonly showThumbnail: boolean;
  readonly imgUrl: string | null;
  readonly box: SinglePhotoOverlayBox;
  readonly label: string;
  readonly icon: string;
}> = ({ showThumbnail, imgUrl, box, label, icon }) => {
  if (showThumbnail && imgUrl && box) {
    return (
      <img
        src={imgUrl}
        alt={label}
        className="absolute max-w-none"
        style={{
          width: `${100 / box.w}%`,
          height: `${100 / box.h}%`,
          left: `${-box.x * (100 / box.w)}%`,
          top: `${-box.y * (100 / box.h)}%`,
        }}
      />
    );
  }
  return <span className="text-sm">{icon}</span>;
};

const CardTags: React.FC<{
  readonly tags: string[];
  readonly sourceLabel?: string;
  readonly chipBackground: string;
  readonly itemKey: string;
}> = ({ tags, sourceLabel, chipBackground, itemKey }) => {
  if (tags.length === 0 && !sourceLabel) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1 pl-12">
      {tags.map((tag) => <Tag key={`${itemKey}-${tag}`} text={tag} color={chipBackground} />)}
      {sourceLabel && <Tag text={sourceLabel} color={chipBackground} />}
    </div>
  );
};

const CardLinks: React.FC<{
  readonly personLinks: LinkInfo[];
  readonly trees: TreeInfo[];
}> = ({ personLinks, trees }) => {
  if (personLinks.length === 0) {
    return null;
  }
  return (
    <div className="mt-1 pt-1.5 border-t border-content/10 flex flex-col gap-1 text-[10px] pl-12">
      <span className="font-semibold text-content-secondary">Family Tree Connections:</span>
      {personLinks.map(link => {
        const tree = trees.find(t => t.id === link.gedcom_tree_id);
        const treeName = tree ? tree.filename : 'Family Tree';
        return (
          <button
            key={link.gedcom_person_id}
            onClick={() => {
              globalThis.dispatchEvent(new CustomEvent('navigate-to-tree', { detail: { treeId: link.gedcom_tree_id, personId: link.gedcom_person_id } }));
              globalThis.dispatchEvent(new CustomEvent('change-view', { detail: 'familyTree' }));
            }}
            className="text-left text-brand-accent hover:underline bg-transparent border-none p-0 cursor-pointer flex items-center gap-1 font-semibold"
          >
            🌳 Appears in {treeName}
          </button>
        );
      })}
    </div>
  );
};

export const OverlayCard: React.FC<{
  readonly asset: Asset;
  readonly item: SinglePhotoPeopleItem;
  readonly hoveredFaceKey?: string | null;
  readonly onHoverFaceKey?: (key: string | null) => void;
  readonly selectedOverlayKey?: string | null;
  readonly onSelectOverlayKey?: (key: string | null) => void;
  readonly trees: TreeInfo[];
  readonly links: LinkInfo[];
}> = ({ asset, item, hoveredFaceKey, onHoverFaceKey, selectedOverlayKey, onSelectOverlayKey, trees, links }) => {
  const isHovered = hoveredFaceKey === item.key || selectedOverlayKey === item.key;
  const colors = getSinglePhotoPeopleColor(item.kind);
  const personLinks = getPersonLinks(item.raw, links);
  const imgUrl = getThumbnailUrl(asset);
  const showThumbnail = shouldShowThumbnail(imgUrl, item.box);

  return (
    <div
      onMouseEnter={() => onHoverFaceKey?.(item.key)}
      onMouseLeave={() => onHoverFaceKey?.(null)}
      onClick={() => onSelectOverlayKey?.(item.key)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectOverlayKey?.(item.key);
        }
      }}
      role="button"
      tabIndex={0}
      className="rounded-lg p-3 flex flex-col gap-1.5 motion-safe:transition-all duration-150"
      style={getCardStyle(isHovered, colors)}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full overflow-hidden relative shrink-0 border border-content/10 bg-surface-secondary flex items-center justify-center">
          <CardThumbnail
            showThumbnail={showThumbnail}
            imgUrl={imgUrl}
            box={item.box}
            label={item.label}
            icon={item.icon}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold truncate" style={{ color: colors.panelText }}>{item.label}</div>
          {item.detail && <div className="text-[10px] leading-tight mt-0.5" style={{ color: colors.panelMutedText }}>{item.detail}</div>}
        </div>
      </div>
      <CardTags
        tags={item.tags}
        sourceLabel={item.sourceLabel}
        chipBackground={colors.chipBackground}
        itemKey={item.key}
      />
      <CardLinks
        personLinks={personLinks}
        trees={trees}
      />
    </div>
  );
};

export const OverlaySection: React.FC<{
  readonly asset: Asset;
  readonly emoji: string;
  readonly title: string;
  readonly items: SinglePhotoPeopleItem[];
  readonly hoveredFaceKey?: string | null;
  readonly onHoverFaceKey?: (key: string | null) => void;
  readonly selectedOverlayKey?: string | null;
  readonly onSelectOverlayKey?: (key: string | null) => void;
  readonly trees: TreeInfo[];
  readonly links: LinkInfo[];
}> = ({ asset, emoji, title, items, hoveredFaceKey, onHoverFaceKey, selectedOverlayKey, onSelectOverlayKey, trees, links }) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <Section emoji={emoji} title={title} hideHeader={title === 'People'}>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <OverlayCard key={item.key} asset={asset} item={item} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} selectedOverlayKey={selectedOverlayKey} onSelectOverlayKey={onSelectOverlayKey} trees={trees} links={links} />
        ))}
      </div>
    </Section>
  );
};

export const PeopleTab: React.FC<PeopleTabProps> = ({ asset, hoveredFaceKey, onHoverFaceKey, selectedOverlayKey, onSelectOverlayKey }) => {
  const model = buildSinglePhotoPeopleModel(asset);
  const resolvedPeople = model.peopleItems.filter((item) => item.kind === 'resolved-person');
  const localDetections = model.peopleItems.filter((item) => item.kind === 'local-face');
  const remoteSubjects = model.peopleItems.filter((item) => item.kind === 'remote-subject');

  const mainPeople = [...resolvedPeople, ...remoteSubjects];

  const [trees, setTrees] = useState<TreeInfo[]>([]);
  const [links, setLinks] = useState<LinkInfo[]>([]);

  useEffect(() => {
    if (!globalRequest) {return;}

    globalRequest<TreeInfo[]>({
      idPrefix: 'get_family_trees',
      command: 'get_family_trees',
      payload: {},
      select: (data) => readResponseItems(data, 'trees', readTreeInfo)
    }).then(setTrees).catch(console.error);

    globalRequest<LinkInfo[]>({
      idPrefix: 'get_people_gedcom_links',
      command: 'get_people_gedcom_links',
      payload: {},
      select: (data) => readResponseItems(data, 'links', readLinkInfo)
    }).then(setLinks).catch(console.error);
  }, []);

  if (model.peopleItems.length === 0) {
    return <EmptyPeopleState />;
  }

  return (
    <div>
      <OverlaySection emoji="🙂" title="People" items={mainPeople} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} selectedOverlayKey={selectedOverlayKey} onSelectOverlayKey={onSelectOverlayKey} asset={asset} trees={trees} links={links} />
      <OverlaySection emoji="👤" title="Local Detections" items={localDetections} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} selectedOverlayKey={selectedOverlayKey} onSelectOverlayKey={onSelectOverlayKey} asset={asset} trees={trees} links={links} />
    </div>
  );
};
