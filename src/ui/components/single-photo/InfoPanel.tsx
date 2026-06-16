import type React from 'react';
import { useCallback, useState } from 'react';
import type { Asset, ReviewItemSummary, TagDefinitionSummary, SimilarityOrbit } from '@contracts/core';
import { ProfileTab } from './info-panel/ProfileTab';
import { LineageTab } from './info-panel/LineageTab';
import { GroupTab } from './info-panel/GroupTab';
import { JsonTab } from './info-panel/JsonTab';
import { PeopleTab } from './info-panel/PeopleTab';
import { AiLogsTab } from './info-panel/AiLogsTab';
import type { TabId } from './info-panel/utils';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import { IconButton, Panel, Header } from '../Primitives';

type InfoPanelProps = {
  readonly asset: Asset;
  readonly width?: number;
  readonly activeTab?: TabId;
  readonly onTabChange?: (tab: TabId) => void;
  readonly onClose?: () => void;
  readonly hoveredFaceKey?: string | null;
  readonly onHoverFaceKey?: (key: string | null) => void;
  readonly availableTags?: TagDefinitionSummary[];
  readonly onAssignTag?: (tagLabel: string) => Promise<void>;
  readonly onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
  readonly onSetReviewItemStatus?: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
  readonly onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
  readonly onGetAiCallsLog?: (assetId: string) => Promise<unknown[]>;
  readonly onGetAiCallLogDetail?: (logId: string) => Promise<unknown>;
  readonly analysisState?: string;
  readonly onRecordPhotoMetadataAssertion?: (assetId: string, fieldPath: string, value: unknown, note?: string | null) => Promise<void>;
  readonly onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
  readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
}

const TABS: Array<{ id: TabId; emoji: string; label: string }> = [
  { id: 'profile', emoji: '🏷️', label: 'Profile' },
  { id: 'people', emoji: '👥', label: 'People' },
  { id: 'lineage', emoji: '🔍', label: 'Lineage' },
  { id: 'group', emoji: '📁', label: 'Group' },
  { id: 'json', emoji: '{ }', label: 'Raw' },
  { id: 'ailogs', emoji: '🤖', label: 'AI Logs' },
];

const PanelHeader: React.FC<{ readonly asset: Asset; readonly onClose?: () => void }> = ({ asset, onClose }) => {
  const filename = asset.original_path.split(/[/\\]/).pop() || '';
  return (
    <Header>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-content break-all">{filename}</div>
      </div>
      {onClose ? (
        <IconButton
          onClick={onClose}
          title="Hide info panel"
          aria-label="Hide info panel"
          className="w-7 h-7 shrink-0"
        >
          ✕
        </IconButton>
      ) : null}
    </Header>
  );
};

const PanelTabs: React.FC<{ readonly activeTab: TabId; readonly setActiveTab: (tab: TabId) => void }> = ({ activeTab, setActiveTab }) => (
  <div className="flex border-b border-content/10 bg-surface-secondary shrink-0">
    {TABS.map((tab) => {
      const isActive = activeTab === tab.id;
      return (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex-1 pt-2.5 pb-2 px-1 bg-transparent border-b-2 cursor-pointer motion-safe:transition-all motion-safe:duration-150 flex flex-col items-center gap-0.5 relative ${
            isActive ? 'border-brand-accent' : 'border-transparent'
          }`}
        >
          <span className={tab.id === 'json' ? 'text-xs' : 'text-sm'}>{tab.emoji}</span>
          <span
            className={`text-xs uppercase tracking-wide ${
              isActive
                ? 'text-brand-accent font-bold'
                : 'text-content-secondary font-normal'
            }`}
          >
            {tab.label}
          </span>
        </button>
      );
    })}
  </div>
);

const PanelContent: React.FC<{
  readonly activeTab: TabId;
  readonly asset: Asset;
  readonly hoveredFaceKey?: string | null;
  readonly onHoverFaceKey?: (key: string | null) => void;
  readonly availableTags?: TagDefinitionSummary[];
  readonly onAssignTag?: (tagLabel: string) => Promise<void>;
  readonly onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
  readonly onSetReviewItemStatus?: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
  readonly onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
  readonly onGetAiCallsLog?: (assetId: string) => Promise<unknown[]>;
  readonly onGetAiCallLogDetail?: (logId: string) => Promise<unknown>;
  readonly analysisState?: string;
  readonly onRecordPhotoMetadataAssertion?: (assetId: string, fieldPath: string, value: unknown, note?: string | null) => Promise<void>;
  readonly onGetGroupOrbit?: (groupId: string) => Promise<SimilarityOrbit>;
  readonly onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
}> = ({ activeTab, asset, hoveredFaceKey, onHoverFaceKey, availableTags, onAssignTag, onRemoveTag, onSetReviewItemStatus, onGetAiCallsLog, onGetAiCallLogDetail, analysisState, onRecordPhotoMetadataAssertion, onGetGroupOrbit, onSetCanonical }) => (
  <div className="flex-1 overflow-y-auto pt-3.5 px-3.5 pb-5 flex flex-col min-h-0">
    {activeTab === 'profile' && (
      <ProfileTab
        asset={asset}
        availableTags={availableTags}
        onAssignTag={onAssignTag}
        onRemoveTag={onRemoveTag}
        onSetReviewItemStatus={onSetReviewItemStatus}
        onRecordPhotoMetadataAssertion={
          onRecordPhotoMetadataAssertion
            ? (fieldPath, value, note) => onRecordPhotoMetadataAssertion(asset.id, fieldPath, value, note)
            : undefined
        }
      />
    )}
    {activeTab === 'people' && <PeopleTab asset={asset} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} />}
    {activeTab === 'lineage' && <LineageTab asset={asset} />}
    {activeTab === 'group' && <GroupTab asset={asset} onGetGroupOrbit={onGetGroupOrbit} onSetCanonical={onSetCanonical} />}
    {activeTab === 'json' && <JsonTab asset={asset} />}
    {activeTab === 'ailogs' && <AiLogsTab assetId={asset.id} onGetAiCallsLog={onGetAiCallsLog} onGetAiCallLogDetail={onGetAiCallLogDetail} analysisState={analysisState} />}
  </div>
);

export const InfoPanel: React.FC<InfoPanelProps> = ({ asset, width = 360, activeTab: controlledTab, onTabChange, onClose, hoveredFaceKey, onHoverFaceKey, availableTags, onAssignTag, onRemoveTag, onSetReviewItemStatus, onFlagPhotoDateCorrection, onGetAiCallsLog, onGetAiCallLogDetail, analysisState, onRecordPhotoMetadataAssertion, onGetGroupOrbit, onSetCanonical }) => {
  const [internalTab, setInternalTab] = useState<TabId>('profile');
  const rawActiveTab = controlledTab ?? internalTab;
  const activeTab = TABS.some((t) => t.id === rawActiveTab) ? rawActiveTab : 'profile';
  const setActiveTab = useCallback((tab: TabId) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  }, [onTabChange]);

  return (
    <Panel
      style={{ width, minWidth: width, maxWidth: width }}
      className="shrink-0"
    >
      <PanelHeader asset={asset} onClose={onClose} />
      <PanelTabs activeTab={activeTab} setActiveTab={setActiveTab} />
      <PanelContent activeTab={activeTab} asset={asset} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} availableTags={availableTags} onAssignTag={onAssignTag} onRemoveTag={onRemoveTag} onSetReviewItemStatus={onSetReviewItemStatus} onFlagPhotoDateCorrection={onFlagPhotoDateCorrection} onGetAiCallsLog={onGetAiCallsLog} onGetAiCallLogDetail={onGetAiCallLogDetail} analysisState={analysisState} onRecordPhotoMetadataAssertion={onRecordPhotoMetadataAssertion} onGetGroupOrbit={onGetGroupOrbit} onSetCanonical={onSetCanonical} />
    </Panel>
  );
};
