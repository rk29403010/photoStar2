import React, { useEffect, useState } from 'react';
import type { Asset } from '@contracts/core';
import type { LibraryPresentationExpansion, LibraryPresentationItem } from '@contracts/libraryPresentation';
import { Section } from './shared';

type RelationshipMember = {
  asset: Asset;
  isRepresentative: boolean;
};

type GroupMembersListProps = {
  readonly items: RelationshipMember[];
  readonly currentAssetId: string;
  readonly loading: boolean;
  readonly onMakeCanonical: (assetId: string) => Promise<void>;
};

const GroupMembersList: React.FC<GroupMembersListProps> = ({ items, currentAssetId, loading, onMakeCanonical }) => {
  if (loading) {
    return <div className="text-xs text-content-secondary py-4 text-center">Loading related photos...</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] text-content-secondary mb-1">
        All files in this presentation ({items.length} files):
      </div>
      {items.map((item) => {
        const fileAsset = item.asset;
        const filename = fileAsset.original_path.split(/[/\\]/).pop() || '';
        const sizeMB = fileAsset.file_size ? `${(fileAsset.file_size / (1024 * 1024)).toFixed(2)} MB` : 'Unknown size';
        const isCurrent = fileAsset.id === currentAssetId;

        return (
          <div
            key={fileAsset.id}
            className={`p-2.5 rounded-lg border flex flex-col gap-1 motion-safe:transition-all ${
              isCurrent ? 'bg-brand-accent/5 border-brand-accent/30' : 'bg-surface-secondary/40 border-content/5'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="font-semibold text-xs text-content truncate select-text" title={fileAsset.original_path}>{filename}</span>
                <span className="text-[10px] text-content-secondary">
                  {sizeMB} · {fileAsset.width && fileAsset.height ? `${fileAsset.width}×${fileAsset.height} px` : ''}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {item.isRepresentative ? (
                  <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[9px] font-bold uppercase tracking-wider">⭐ Star</span>
                ) : (
                  <button
                    onClick={() => { void onMakeCanonical(fileAsset.id); }}
                    className="px-1.5 py-0.5 bg-content/5 hover:bg-content/10 border border-content/10 rounded text-[9px] font-medium transition-colors cursor-pointer"
                    title="Make this the star image for this presentation"
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
  readonly items: RelationshipMember[];
  readonly selectedVariantId: string;
  readonly setSelectedVariantId: (v: string) => void;
  readonly exporting: boolean;
  readonly handleExport: () => void;
  readonly exportSuccess: string | null;
};

const GroupExportSection: React.FC<GroupExportSectionProps> = ({ isVariantGroup, items, selectedVariantId, setSelectedVariantId, exporting, handleExport, exportSuccess }) => (
  <div className="bg-surface-secondary/45 border border-content/5 rounded-lg p-3.5 flex flex-col gap-3">
    {isVariantGroup ? (
      <div className="flex flex-col gap-2.5">
        <span className="text-xs text-content-secondary leading-relaxed">
          ℹ️ This is a <strong>Variant Group</strong>. Choose which file to use as the template for exporting the synthesised metadata:
        </span>
        <select
          value={selectedVariantId}
          onChange={(event) => setSelectedVariantId(event.target.value)}
          disabled={exporting}
          className="w-full bg-surface text-content border border-content/15 rounded px-2.5 py-1.5 text-xs outline-none cursor-pointer focus:border-brand-accent/40"
        >
          {items.map((item) => {
            const filename = item.asset.original_path.split(/[/\\]/).pop() || '';
            return <option key={item.asset.id} value={item.asset.id}>{filename} {item.isRepresentative ? '(Star)' : ''}</option>;
          })}
        </select>
      </div>
    ) : (
      <span className="text-xs text-content-secondary leading-relaxed">
        ℹ️ This presentation groups files that PhotoStar currently treats as related. Exporting will create a single new file using the best synthesised metadata estimates (date, location, tags, and caption).
      </span>
    )}
    <button
      onClick={handleExport}
      disabled={exporting || items.length === 0}
      className="w-full py-2 bg-brand-accent/20 hover:bg-brand-accent/35 text-brand-accent border border-brand-accent/35 rounded text-xs font-bold motion-safe:transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
    >
      {exporting ? 'Processing Export...' : 'Export Authoritative File'}
    </button>
    {exportSuccess && <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-400 text-[11px] leading-normal motion-safe:animate-fade-in">🎉 {exportSuccess}</div>}
  </div>
);

function presentationMembers(expansion: LibraryPresentationExpansion): RelationshipMember[] {
  return expansion.items.map((item) => ({ asset: item.asset, isRepresentative: item.isRepresentative }));
}

function getExportSuccessMessage(groupType: string, items: RelationshipMember[], selectedVariantId: string): string {
  if (groupType === 'variant') {
    const selectedAsset = items.find((item) => item.asset.id === selectedVariantId)?.asset;
    const filename = selectedAsset?.original_path.split(/[/\\]/).pop() || 'photo.jpg';
    return `Successfully exported variant "${filename}" as new authoritative file!`;
  }
  return 'Successfully exported presentation as a new authoritative file!';
}

type RelationshipLoadActions = {
  readonly onGetPresentationExpansion?: (presentationKey: string) => Promise<LibraryPresentationExpansion>;
  readonly onSetPresentationCover?: (presentationKey: string, assetId: string) => Promise<void>;
};

function useRelationshipMembers(params: {
  presentation?: LibraryPresentationItem | null;
  actions: RelationshipLoadActions;
  setSelectedVariantId: (assetId: string) => void;
}) {
  const { presentation, actions, setSelectedVariantId } = params;
  const [items, setItems] = useState<RelationshipMember[]>([]);
  const [loading, setLoading] = useState(false);
  const presentationKey = presentation && presentation.stackCount > 1 ? presentation.presentationKey : null;

  useEffect(() => {
    setItems([]);
    if (!presentationKey || !actions.onGetPresentationExpansion) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void actions.onGetPresentationExpansion(presentationKey)
      .then((expansion) => {
        setItems(presentationMembers(expansion));
        setSelectedVariantId(expansion.representativeAssetId);
      })
      .catch((error: unknown) => console.error('Failed to load presentation:', error))
      .finally(() => setLoading(false));
  }, [actions.onGetPresentationExpansion, presentationKey, setSelectedVariantId]);

  return { items, setItems, loading, presentationKey };
}

function useGroupTabState(asset: Asset, presentation: LibraryPresentationItem | null | undefined, actions: RelationshipLoadActions) {
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(presentation?.representativeAssetId ?? asset.id);
  const { items, setItems, loading, presentationKey } = useRelationshipMembers({ presentation, actions, setSelectedVariantId });
  const groupType = presentation?.relationshipKind ?? 'similar';

  const handleMakeCanonical = async (assetId: string) => {
    if (!presentationKey || !actions.onSetPresentationCover) {return;}
    try {
      await actions.onSetPresentationCover(presentationKey, assetId);
      setItems((currentItems) => currentItems.map((item) => ({ ...item, isRepresentative: item.asset.id === assetId })));
      setSelectedVariantId(assetId);
    } catch (error) {
      console.error('Failed to set presentation cover:', error);
    }
  };

  const handleExport = () => {
    setExporting(true);
    setExportSuccess(null);
    setTimeout(() => {
      setExporting(false);
      setExportSuccess(getExportSuccessMessage(groupType ?? 'similar', items, selectedVariantId));
    }, 2000);
  };

  return {
    relationshipId: presentationKey,
    groupType: groupType ?? 'similar',
    items,
    loading,
    exporting,
    exportSuccess,
    selectedVariantId,
    setSelectedVariantId,
    handleMakeCanonical,
    handleExport,
  };
}

type GroupTabProps = RelationshipLoadActions & {
  readonly asset: Asset;
  readonly presentation?: LibraryPresentationItem | null;
};

export const GroupTab: React.FC<GroupTabProps> = ({ asset, presentation, onGetPresentationExpansion, onSetPresentationCover }) => {
  const state = useGroupTabState(asset, presentation, { onGetPresentationExpansion, onSetPresentationCover });

  if (!state.relationshipId) {
    return (
      <div className="text-center py-10 px-5 text-content-secondary/60 select-none">
        <div className="text-3xl mb-2.5">📁</div>
        <div className="text-xs font-bold uppercase text-content-secondary/80">Single Photo</div>
        <div className="text-[11px] text-content-secondary/70 mt-1">This photo is not currently part of a collapsed relationship presentation.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-content select-none">
      <Section emoji="📁" title={`Relationship: ${state.groupType.toUpperCase()}`}>
        <GroupMembersList items={state.items} currentAssetId={asset.id} loading={state.loading} onMakeCanonical={state.handleMakeCanonical} />
      </Section>
      <Section emoji="📤" title="Authoritative Export">
        <GroupExportSection
          isVariantGroup={state.groupType === 'variant'}
          items={state.items}
          selectedVariantId={state.selectedVariantId}
          setSelectedVariantId={state.setSelectedVariantId}
          exporting={state.exporting}
          handleExport={state.handleExport}
          exportSuccess={state.exportSuccess}
        />
      </Section>
    </div>
  );
};
