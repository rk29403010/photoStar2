import { useState } from 'react';
import type {
  Album,
  Asset,
  GalleryTimelineSeek,
  LibraryStats,
  Person,
  ReviewItemSummary,
  TagAliasSummary,
  TagDefinitionSummary,
} from '@contracts/core';
import type {
  DataStatsSnapshot,
  JobErrorSnapshot,
  RecentEventSnapshot,
  WorkflowRunListItem,
  WorkflowStatusSnapshot,
} from '@contracts/jobs';
import type { UiFeedEntry } from '@contracts/usePhotoLibrary.types';
import type { GroupDiagnosticsReport } from '@contracts/groupDiagnostics';
import type { WorkflowVisualiserModel } from '@contracts/workflowVisualiser';
import type { LibraryGalleryDataMode } from '@shared/utils/libraryGallery';
import type { LibrarySelectionState } from '@shared/utils/librarySelectionState';
import { buildStablePreviewAssets } from '@shared/utils/stablePreviewAssets';
import type { PhotoDateCorrectionInput } from '@ui/hooks/usePhotoDateReviewHandler';
import type { InfoTab } from '@ui/hooks/useAppRuntimeUi';
import type { GalleryOrder } from '@ui/hooks/usePhotoLibrary.gallery';
import type { TimelineGalleryStateSlice } from '@ui/hooks/useTimelineGalleryState';
import { useAvailableTags } from '@ui/hooks/useAvailableTags';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { AlbumsView } from '../AlbumsView';
import { DashboardView } from '../DashboardView';
import { GroupingDiagnosticsView } from '../group-diagnostics/GroupingDiagnosticsView';
import { LibraryView } from '../LibraryView';
import { PeopleView } from '../PeopleView';
import { ReviewsView } from '../ReviewsView';
import { TagVocabularyView } from '../TagVocabularyView';
import { WorkflowWorkspace } from '../workflows/WorkflowWorkspace';

type TagDetailPayload = {
  tag: TagDefinitionSummary;
  aliases: TagAliasSummary[];
};

type AppMainContentProps = {
  readonly view: 'library' | 'people' | 'dashboard' | 'albums' | 'reviews' | 'vocabulary' | 'workflows' | 'groupDiagnostics';
  readonly selectedWorkflowId: string;
  readonly onSelectWorkflowId: (workflowId: string) => void;
  readonly stats: LibraryStats | null;
  readonly timelineGallery: TimelineGalleryStateSlice;
  readonly assets: Asset[];
  readonly galleryTimelineSeek: GalleryTimelineSeek | null;
  readonly isSeekingTimeline: boolean;
  readonly people: Person[];
  readonly status: string;
  readonly backendReady: boolean;
  readonly filterStack: LibraryFilter[];
  readonly selectedAssetId: string | null;
  readonly showInfoPanel: boolean;
  readonly setShowInfoPanel: (show: boolean) => void;
  readonly activeInfoTab: InfoTab;
  readonly setActiveInfoTab: (tab: InfoTab) => void;
  readonly libraryActive: boolean;
  readonly showFaces: boolean;
  readonly librarySelection: LibrarySelectionState;
  readonly groupSimilarPhotos: boolean;
  readonly showGroupIds: boolean;
  readonly groupDiagnosticsReport: GroupDiagnosticsReport | null;
  readonly isLoadingGroupDiagnostics: boolean;
  readonly declusteredAssets: Set<string>;
  readonly showRejected: boolean;
  readonly rejectedAssets: Asset[];
  readonly workflowStatus: WorkflowStatusSnapshot | null;
  readonly dataStats: DataStatsSnapshot | null;
  readonly recentEvents: RecentEventSnapshot[];
  readonly workflowRuns: WorkflowRunListItem[];
  readonly uiFeedEntries: UiFeedEntry[];
  readonly ingestActive: boolean;
  readonly hasMoreAssets: boolean;
  readonly isLoadingMoreAssets: boolean;
  readonly isRefreshingLibrary: boolean;
  readonly onLoadMoreAssets: () => Promise<void>;
  readonly onLoadTimelineGroupPage: (groupId: string) => void;
  readonly onRequestTimelineJumpTarget: (groupId: string) => void;
  readonly onTimelineVisibleGroupChange: (groupId: string | null, groupIndex: number | null) => void;
  readonly onGalleryDataModeChange: (mode: LibraryGalleryDataMode) => void;
  readonly onGalleryOrderChange: (order: GalleryOrder) => void;
  readonly onGalleryTimelineSeek: (seek: GalleryTimelineSeek | null) => void;
  readonly onAssetClick: (id: string | null) => void;
  readonly onEnsureAssetDetails: (assetId: string) => void;
  readonly onTagFilterChange: (tag: string) => void;
  readonly onUntagAsset: (assetId: string, personId: string) => void;
  readonly onLibrarySelectionChange: (selection: LibrarySelectionState) => void;
  readonly onGroupSimilarPhotosChange: (enabled: boolean) => void;
  readonly onShowGroupIdsChange: (enabled: boolean) => void;
  readonly onRefreshGroupDiagnostics: () => void;
  readonly onPeopleFilter: (filter: LibraryFilter) => void;
  readonly onPeopleSelectionChange: (count: number) => void;
  readonly onRenamePerson: (id: string, name: string) => void;
  readonly onMergePeople: (ids: string[], targetName: string) => void;
  readonly onRefreshSystemJobs: () => void;
  readonly onGetEventPayloadRaw: (eventId: string) => Promise<string>;
  readonly onGetJobErrors: (payload: { moduleId?: string; page?: number; pageSize?: number }) => Promise<JobErrorSnapshot>;
  readonly onGetWorkflowVisualiser: (workflowId: string, runId?: string | null) => Promise<WorkflowVisualiserModel>;
  readonly onRerunMissingFolderAiMetadata: (runId: string) => Promise<{ runId: string | null; assetCount: number }>;
  readonly onGetAlbums: () => Promise<Album[]>;
  readonly onCreateAlbum: (title: string, description?: string) => Promise<{ albumId: string }>;
  readonly onDeleteAlbum: (id: string) => Promise<void>;
  readonly onOpenAlbum: (albumId: string, title: string) => void;
  readonly onHoverLibraryAssetChange: (asset: Asset | null) => void;
  readonly onListAvailableTags: () => Promise<TagDefinitionSummary[]>;
  readonly onListReviewItems: (payload: {
    status?: ReviewItemSummary['status'];
    reviewItemType?: ReviewItemSummary['reviewItemType'];
    subjectType?: string;
    subjectId?: string;
  }) => Promise<ReviewItemSummary[]>;
  readonly onAssignAssetTag: (assetId: string, tagLabel: string) => Promise<void>;
  readonly onRemoveAssetTag: (assetId: string, tagDefinitionId: string) => Promise<void>;
  readonly onMoveAssetToBin: (assetId: string) => Promise<void>;
  readonly onRestoreAssetFromBin: (assetId: string) => Promise<void>;
  readonly onSetReviewItemStatus: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
  readonly onGetTagDefinitionDetail: (payload: { tagDefinitionId: string }) => Promise<TagDetailPayload>;
  readonly onRenameTagDefinition: (payload: { tagDefinitionId: string; canonicalLabel: string }) => Promise<TagDetailPayload>;
  readonly onCreateTagAlias: (payload: { tagDefinitionId: string; aliasLabel: string }) => Promise<TagDetailPayload>;
  readonly onDeleteTagAlias: (payload: { tagAliasId: string }) => Promise<TagDetailPayload>;
  readonly onMergeTagDefinitions: (payload: { sourceTagDefinitionId: string; targetTagDefinitionId: string }) => Promise<TagDetailPayload>;
  readonly onFlagPhotoDateCorrection: (input: PhotoDateCorrectionInput) => Promise<void>;
}

function getPanelStyle(active: boolean) {
  return {
    display: active ? 'flex' : 'none',
    flex: 1,
    minHeight: 0,
    flexDirection: 'column' as const,
  };
}

function createVisibleAssetCache(initialAssets: Asset[]) {
  let visibleAssets = initialAssets;

  return {
    update(nextAssets: Asset[], ingestActive: boolean) {
      visibleAssets = buildStablePreviewAssets(visibleAssets, nextAssets, ingestActive);
      return visibleAssets;
    },
  };
}

function useVisibleLibraryAssets(assets: Asset[], ingestActive: boolean) {
  const [cache] = useState(() => createVisibleAssetCache(buildStablePreviewAssets([], assets, ingestActive)));
  return cache.update(assets, ingestActive);
}

function LibraryContentView(props: AppMainContentProps & { readonly visibleLibraryAssets: Asset[]; readonly activeFilter?: LibraryFilter }) {
  const availableTags = useAvailableTags(props.view === 'library', props.onListAvailableTags);

  return (
    <div style={getPanelStyle(props.view === 'library')}>
      <LibraryView
        stats={props.stats}
        timelineGallery={props.timelineGallery}
        assets={props.visibleLibraryAssets}
        galleryTimelineSeek={props.galleryTimelineSeek}
        isSeekingTimeline={props.isSeekingTimeline}
        availableTags={availableTags.map((tag) => tag.canonicalLabel)}
        loading={props.status.includes('Initializing')}
        isRefreshingLibrary={props.isRefreshingLibrary}
        backendReady={props.backendReady}
        backendStatus={props.status}
        hasMoreAssets={props.hasMoreAssets}
        isLoadingMoreAssets={props.isLoadingMoreAssets}
        onLoadMoreAssets={props.onLoadMoreAssets}
        onLoadTimelineGroupPage={props.onLoadTimelineGroupPage}
        onRequestTimelineJumpTarget={props.onRequestTimelineJumpTarget}
        onTimelineVisibleGroupChange={props.onTimelineVisibleGroupChange}
        onGalleryDataModeChange={props.onGalleryDataModeChange}
        onGalleryOrderChange={props.onGalleryOrderChange}
        onGalleryTimelineSeek={props.onGalleryTimelineSeek}
        active={props.libraryActive}
        onAssetClick={props.onAssetClick}
        selectedAssetId={props.selectedAssetId}
        showInfoPanel={props.showInfoPanel}
        onShowInfoPanelChange={props.setShowInfoPanel}
        activeInfoTab={props.activeInfoTab}
        onActiveInfoTabChange={props.setActiveInfoTab}
        activeFilter={props.activeFilter}
        onTagFilterChange={props.onTagFilterChange}
        showFaces={props.showFaces}
        onEnsureAssetDetails={props.onEnsureAssetDetails}
        onUntagAsset={props.onUntagAsset}
        librarySelection={props.librarySelection}
        groupSimilarPhotos={props.groupSimilarPhotos}
        showGroupIds={props.showGroupIds}
        onLibrarySelectionChange={props.onLibrarySelectionChange}
        onGroupSimilarPhotosChange={props.onGroupSimilarPhotosChange}
        onShowGroupIdsChange={props.onShowGroupIdsChange}
        declusteredAssets={props.declusteredAssets}
        showRejected={props.showRejected}
        rejectedAssets={props.showRejected ? props.rejectedAssets : []}
        onHoverAssetChange={props.onHoverLibraryAssetChange}
        onAssignAssetTag={props.onAssignAssetTag}
        onRemoveAssetTag={props.onRemoveAssetTag}
        onSetReviewItemStatus={props.onSetReviewItemStatus}
        onFlagPhotoDateCorrection={props.onFlagPhotoDateCorrection}
      />
    </div>
  );
}

export function AppMainContent(props: AppMainContentProps) {
  const activeFilter = props.filterStack.length > 0 ? props.filterStack[props.filterStack.length - 1] : undefined;
  const visibleLibraryAssets = useVisibleLibraryAssets(props.assets, props.ingestActive);

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <LibraryContentView {...props} visibleLibraryAssets={visibleLibraryAssets} activeFilter={activeFilter} />

      {props.view === 'people' && (
        <PeopleView
          people={props.people}
          onFilter={props.onPeopleFilter}
          onSelectionChange={props.onPeopleSelectionChange}
          onRename={props.onRenamePerson}
          onMerge={props.onMergePeople}
        />
      )}

      {props.view === 'dashboard' && (
        <DashboardView
          workflowStatus={props.workflowStatus}
          dataStats={props.dataStats}
          recentEvents={props.recentEvents}
          workflowRuns={props.workflowRuns}
          uiFeedEntries={props.uiFeedEntries}
          refreshSystemJobs={props.onRefreshSystemJobs}
          onGetEventPayloadRaw={props.onGetEventPayloadRaw}
          onGetJobErrors={props.onGetJobErrors}
          loading={!props.backendReady}
        />
      )}

      {props.view === 'albums' && (
        <AlbumsView
          getAlbums={props.onGetAlbums}
          createAlbum={props.onCreateAlbum}
          deleteAlbum={props.onDeleteAlbum}
          onOpenAlbum={props.onOpenAlbum}
        />
      )}

      {props.view === 'reviews' && (
        <ReviewsView
          active={props.view === 'reviews'}
          listReviewItems={props.onListReviewItems}
          listAvailableTags={props.onListAvailableTags}
          setReviewItemStatus={props.onSetReviewItemStatus}
        />
      )}

      {props.view === 'vocabulary' && (
        <TagVocabularyView
          active={props.view === 'vocabulary'}
          listAvailableTags={props.onListAvailableTags}
          getTagDefinitionDetail={props.onGetTagDefinitionDetail}
          renameTagDefinition={props.onRenameTagDefinition}
          createTagAlias={props.onCreateTagAlias}
          deleteTagAlias={props.onDeleteTagAlias}
          mergeTagDefinitions={props.onMergeTagDefinitions}
        />
      )}

      {props.view === 'workflows' && (
        <WorkflowWorkspace
          workflowId={props.selectedWorkflowId}
          onWorkflowIdChange={props.onSelectWorkflowId}
          onGetWorkflowVisualiser={props.onGetWorkflowVisualiser}
          onRerunMissingFolderAiMetadata={props.onRerunMissingFolderAiMetadata}
        />
      )}

      {props.view === 'groupDiagnostics' && (
        <GroupingDiagnosticsView
          report={props.groupDiagnosticsReport}
          loading={props.isLoadingGroupDiagnostics}
          onRefresh={props.onRefreshGroupDiagnostics}
          onAssetClick={(assetId) => props.onAssetClick(assetId)}
        />
      )}
    </div>
  );
}
