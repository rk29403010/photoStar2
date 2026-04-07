import type React from 'react';
import { useCallback, useState } from 'react';
import type { Asset, ReviewItemSummary, TagDefinitionSummary } from '@contracts/core';
import { AnalysisTab } from './info-panel/AnalysisTab';
import { FileTab } from './info-panel/FileTab';
import { JsonTab } from './info-panel/JsonTab';
import { PeopleTab } from './info-panel/PeopleTab';
import type { TabId } from './info-panel/utils';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';

interface InfoPanelProps {
  asset: Asset;
  width?: number;
  activeTab?: TabId;
  onTabChange?: (tab: TabId) => void;
  onClose?: () => void;
  hoveredFaceKey?: string | null;
  onHoverFaceKey?: (key: string | null) => void;
  availableTags?: TagDefinitionSummary[];
  onAssignTag?: (tagLabel: string) => Promise<void>;
  onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
  onSetReviewItemStatus?: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
  onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
}

const TABS: Array<{ id: TabId; emoji: string; label: string }> = [
  { id: 'file', emoji: '📁', label: 'File' },
  { id: 'analysis', emoji: '🧠', label: 'Analysis' },
  { id: 'people', emoji: '👥', label: 'People' },
  { id: 'json', emoji: '{ }', label: 'Raw' },
];

const PanelHeader: React.FC<{ asset: Asset; hasAI: boolean; onClose?: () => void }> = ({ asset, hasAI, onClose }) => {
  const filename = asset.original_path.split(/[/\\]/).pop() || '';
  return (
    <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #1e293b', background: 'rgba(15,23,42,0.9)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 2, wordBreak: 'break-all' }}>📷 {filename}</div>
          <div style={{ fontSize: 10, color: '#475569' }}>{asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''}{hasAI ? '🧠 Analysed' : '⏳ Not yet analysed'}</div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            title="Hide info panel"
            aria-label="Hide info panel"
            style={{ background: 'transparent', border: '1px solid rgba(148,163,184,0.22)', color: '#cbd5e1', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
};

const PanelTabs: React.FC<{ activeTab: TabId; setActiveTab: (tab: TabId) => void }> = ({ activeTab, setActiveTab }) => (
  <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', background: '#080d1a', flexShrink: 0 }}>
    {TABS.map((tab) => {
      const isActive = activeTab === tab.id;
      return (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '10px 4px 8px', background: 'transparent', border: 'none', borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative' }}>
          <span style={{ fontSize: tab.id === 'json' ? 10 : 14 }}>{tab.emoji}</span>
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, color: isActive ? '#818cf8' : '#475569', fontWeight: isActive ? 700 : 400 }}>{tab.label}</span>
        </button>
      );
    })}
  </div>
);

const PanelContent: React.FC<{
  activeTab: TabId;
  asset: Asset;
  hoveredFaceKey?: string | null;
  onHoverFaceKey?: (key: string | null) => void;
  availableTags?: TagDefinitionSummary[];
  onAssignTag?: (tagLabel: string) => Promise<void>;
  onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
  onSetReviewItemStatus?: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
  onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
}> = ({ activeTab, asset, hoveredFaceKey, onHoverFaceKey, availableTags, onAssignTag, onRemoveTag, onSetReviewItemStatus, onFlagPhotoDateCorrection }) => (
  <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 20px' }}>
    {activeTab === 'file' && <FileTab asset={asset} availableTags={availableTags} onAssignTag={onAssignTag} onRemoveTag={onRemoveTag} onSetReviewItemStatus={onSetReviewItemStatus} onFlagPhotoDateCorrection={onFlagPhotoDateCorrection} />}
    {activeTab === 'analysis' && <AnalysisTab asset={asset} />}
    {activeTab === 'people' && <PeopleTab asset={asset} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} />}
    {activeTab === 'json' && <JsonTab asset={asset} />}
  </div>
);

export const InfoPanel: React.FC<InfoPanelProps> = ({ asset, width = 360, activeTab: controlledTab, onTabChange, onClose, hoveredFaceKey, onHoverFaceKey, availableTags, onAssignTag, onRemoveTag, onSetReviewItemStatus, onFlagPhotoDateCorrection }) => {
  const [internalTab, setInternalTab] = useState<TabId>('file');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = useCallback((tab: TabId) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  }, [onTabChange]);

  const hasAI = Boolean(asset.photo_metadata?.projection || asset.ai_metadata);

  return (
    <div style={{ width, minWidth: width, maxWidth: width, height: '100%', background: 'linear-gradient(180deg, #0f172a 0%, #0a0f1e 100%)', borderLeft: '1px solid #1e293b', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden', flexShrink: 0 }}>
      <PanelHeader asset={asset} hasAI={hasAI} onClose={onClose} />
      <PanelTabs activeTab={activeTab} setActiveTab={setActiveTab} />
      <PanelContent activeTab={activeTab} asset={asset} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} availableTags={availableTags} onAssignTag={onAssignTag} onRemoveTag={onRemoveTag} onSetReviewItemStatus={onSetReviewItemStatus} onFlagPhotoDateCorrection={onFlagPhotoDateCorrection} />
    </div>
  );
};
