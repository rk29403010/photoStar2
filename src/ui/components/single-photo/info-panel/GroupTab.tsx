import React, { useEffect, useState } from 'react';
import type { Asset, SimilarityOrbit, SimilarityOrbitItem } from '@contracts/core';
import { Section } from './shared';

type GroupMembersListProps = {
  readonly items: SimilarityOrbitItem[];
  readonly currentAssetId: string;
  readonly loading: boolean;
  readonly onMakeCanonical: (assetId: string) => Promise<void>;
};

const GroupMembersList: React.FC<GroupMembersListProps> = ({
  items,
  currentAssetId,
  loading,
  onMakeCanonical,
}) => {
  if (loading) {
    return <div className="text-xs text-content-secondary py-4 text-center">Loading group assets...</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] text-content-secondary mb-1">
        All files in this duplicate/similar group ({items.length} files):
      </div>
      {items.map((item) => {
        const fileAsset = item.asset;
        const filename = fileAsset.original_path.split(/[/\\]/).pop() || '';
        const isCanonical = fileAsset.group_role === 'canonical' || (fileAsset as unknown as Record<string, unknown>).role === 'canonical';
        const sizeMB = fileAsset.file_size ? `${(fileAsset.file_size / (1024 * 1024)).toFixed(2)} MB` : 'Unknown size';
        const isCurrent = fileAsset.id === currentAssetId;

        return (
          <div
            key={fileAsset.id}
            className={`p-2.5 rounded-lg border flex flex-col gap-1 motion-safe:transition-all ${
              isCurrent
                ? 'bg-brand-accent/5 border-brand-accent/30'
                : 'bg-surface-secondary/40 border-content/5'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="font-semibold text-xs text-content truncate select-text" title={fileAsset.original_path}>
                  {filename}
                </span>
                <span className="text-[10px] text-content-secondary">
                  {sizeMB} · {fileAsset.width && fileAsset.height ? `${fileAsset.width}×${fileAsset.height} px` : ''}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isCanonical ? (
                  <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[9px] font-bold uppercase tracking-wider">
                    ⭐ Star
                  </span>
                ) : (
                  <button
                    onClick={() => onMakeCanonical(fileAsset.id)}
                    className="px-1.5 py-0.5 bg-content/5 hover:bg-content/10 border border-content/10 rounded text-[9px] font-medium transition-colors cursor-pointer"
                    title="Make this the star image for grouping"
                  >
                    Make Star
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

type GroupExportSectionProps = {
  readonly isVariantGroup: boolean;
  readonly items: SimilarityOrbitItem[];
  readonly selectedVariantId: string;
  readonly setSelectedVariantId: (v: string) => void;
  readonly exporting: boolean;
  readonly handleExport: () => void;
  readonly exportSuccess: string | null;
};

const GroupExportSection: React.FC<GroupExportSectionProps> = ({
  isVariantGroup,
  items,
  selectedVariantId,
  setSelectedVariantId,
  exporting,
  handleExport,
  exportSuccess,
}) => {
  return (
    <div className="bg-surface-secondary/45 border border-content/5 rounded-lg p-3.5 flex flex-col gap-3">
      {isVariantGroup ? (
        <div className="flex flex-col gap-2.5">
          <span className="text-xs text-content-secondary leading-relaxed">
            ℹ️ This is a <strong>Variant Group</strong> (e.g. photos showing different years, different versions, or photos of the same person at different ages). Choose which file to use as the template for exporting the synthesised metadata:
          </span>
          <select
            value={selectedVariantId}
            onChange={(e) => setSelectedVariantId(e.target.value)}
            disabled={exporting}
            className="w-full bg-surface text-content border border-content/15 rounded px-2.5 py-1.5 text-xs outline-none cursor-pointer focus:border-brand-accent/40"
          >
            {items.map((item) => {
              const filename = item.asset.original_path.split(/[/\\]/).pop() || '';
              const isCanonical = item.asset.group_role === 'canonical' || (item.asset as unknown as Record<string, unknown>).role === 'canonical';
              return (
                <option key={item.asset.id} value={item.asset.id}>
                  {filename} {isCanonical ? '(Star)' : ''}
                </option>
              );
            })}
          </select>
        </div>
      ) : (
        <span className="text-xs text-content-secondary leading-relaxed">
          ℹ️ This is a <strong>Duplicate/Similar Group</strong>. Exporting will collapse these down and create a single new file embedded with the best synthesised metadata estimates (date, location, tags, and caption).
        </span>
      )}

      <button
        onClick={handleExport}
        disabled={exporting || items.length === 0}
        className="w-full py-2 bg-brand-accent/20 hover:bg-brand-accent/35 text-brand-accent border border-brand-accent/35 rounded text-xs font-bold motion-safe:transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
      >
        {exporting ? 'Processing Export...' : 'Export Authoritative File'}
      </button>

      {exportSuccess && (
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-400 text-[11px] leading-normal motion-safe:animate-fade-in">
          🎉 {exportSuccess}
        </div>
      )}
    </div>
  );
};

function findStarAssetId(items: SimilarityOrbitItem[], defaultId: string): string {
  const canonical = items.find((item) => {
    const asset = item.asset;
    const role = (asset as unknown as Record<string, unknown>).role;
    return asset.group_role === 'canonical' || role === 'canonical';
  });
  return canonical?.asset.id ?? defaultId;
}

function getExportSuccessMessage(groupType: string, orbit: SimilarityOrbit | null, selectedVariantId: string): string {
  if (groupType === 'variant') {
    const selectedAsset = orbit?.items.find((i) => i.asset.id === selectedVariantId)?.asset;
    const filename = selectedAsset?.original_path.split(/[/\\]/).pop() || 'photo.jpg';
    return `Successfully exported variant "${filename}" as new authoritative file!`;
  }
  return `Successfully collapsed and exported group as new authoritative file!`;
}

function useGroupTabState(
  asset: Asset,
  onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>,
  onSetCanonical?: (groupId: string, assetId: string) => Promise<void>
) {
  const [orbit, setOrbit] = useState<SimilarityOrbit | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');

  const groupId = asset.group_id || asset.group_memberships?.[0]?.group_id;
  const groupType = orbit?.group_type || asset.group_memberships?.[0]?.group_type || 'similar';

  useEffect(() => {
    if (!groupId || !onGetGroupOrbit) {
      setOrbit(null);
      return;
    }

    setLoading(true);
    setExportSuccess(null);
    onGetGroupOrbit(groupId)
      .then((data) => {
        setOrbit(data);
        setSelectedVariantId(findStarAssetId(data.items, asset.id));
      })
      .catch((err) => console.error('Failed to load group orbit:', err))
      .finally(() => setLoading(false));
  }, [groupId, asset.id, onGetGroupOrbit]);

  const handleMakeCanonical = async (assetId: string) => {
    if (!groupId || !onSetCanonical) { return; }
    try {
      await onSetCanonical(groupId, assetId);
      if (onGetGroupOrbit) {
        const data = await onGetGroupOrbit(groupId);
        setOrbit(data);
      }
    } catch (err) {
      console.error('Failed to set canonical asset:', err);
    }
  };

  const handleExport = () => {
    setExporting(true);
    setExportSuccess(null);
    setTimeout(() => {
      setExporting(false);
      setExportSuccess(getExportSuccessMessage(groupType, orbit, selectedVariantId));
    }, 2000);
  };

  return {
    groupId,
    groupType,
    orbit,
    loading,
    exporting,
    exportSuccess,
    selectedVariantId,
    setSelectedVariantId,
    handleMakeCanonical,
    handleExport,
  };
}

type GroupTabProps = {
  readonly asset: Asset;
  readonly onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
  readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
};

export const GroupTab: React.FC<GroupTabProps> = ({
  asset,
  onGetGroupOrbit,
  onSetCanonical,
}) => {
  const {
    groupId,
    groupType,
    orbit,
    loading,
    exporting,
    exportSuccess,
    selectedVariantId,
    setSelectedVariantId,
    handleMakeCanonical,
    handleExport,
  } = useGroupTabState(asset, onGetGroupOrbit, onSetCanonical);

  if (!groupId) {
    return (
      <div className="text-center py-10 px-5 text-content-secondary/60 select-none">
        <div className="text-3xl mb-2.5">📁</div>
        <div className="text-xs font-bold uppercase text-content-secondary/80">Single Photo</div>
        <div className="text-[11px] text-content-secondary/70 mt-1">This photo is not part of any duplicate or similar photo group.</div>
      </div>
    );
  }

  const items = orbit?.items ?? [];
  const isVariantGroup = groupType === 'variant';

  return (
    <div className="flex flex-col gap-4 text-content select-none">
      <Section emoji="📁" title={`Group: ${groupType.toUpperCase()}`}>
        <GroupMembersList
          items={items}
          currentAssetId={asset.id}
          loading={loading}
          onMakeCanonical={handleMakeCanonical}
        />
      </Section>

      <Section emoji="📤" title="Authoritative Export">
        <GroupExportSection
          isVariantGroup={isVariantGroup}
          items={items}
          selectedVariantId={selectedVariantId}
          setSelectedVariantId={setSelectedVariantId}
          exporting={exporting}
          handleExport={handleExport}
          exportSuccess={exportSuccess}
        />
      </Section>
    </div>
  );
};
