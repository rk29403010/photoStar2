import { useCallback, useEffect, useState } from 'react';
import type { CurrentPhotoStatus } from '@shared/utils/libraryGallery';
import type { DevRuntimeImpact } from '@contracts/devRuntime';
import {
  createEmptyLibrarySelectionState,
  type LibrarySelectionState,
} from '@shared/utils/librarySelectionState';
import type { StatusBanner } from '@ui/components/app/statusBannerModel';
import { createStatusMessageBanner } from '@ui/components/app/statusBannerModel';
import { usePersistedState } from './usePersistedState';

export type AppView = 'library' | 'people' | 'familyTree' | 'dashboard' | 'albums' | 'reviews' | 'vocabulary' | 'workflows' | 'groupDiagnostics';
export type InfoTab = 'profile' | 'people' | 'lineage' | 'group' | 'json' | 'ailogs';
export type AiMode = 'mock' | 'live' | 'off';

function useDevRuntimeImpact(
  enabled: boolean,
  getDevRuntimeImpact: () => Promise<DevRuntimeImpact>
) {
  const [devRuntimeImpact, setDevRuntimeImpact] = useState<DevRuntimeImpact | null>(null);
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const refreshImpact = () => {
      void getDevRuntimeImpact()
        .then((impact) => {
          if (!cancelled) {
            setDevRuntimeImpact(impact);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setDevRuntimeImpact(null);
          }
        });
    };

    refreshImpact();
    const intervalId = globalThis.setInterval(refreshImpact, 5000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(intervalId);
    };
  }, [enabled, getDevRuntimeImpact]);

  return devRuntimeImpact;
}

function useStatusBannerState() {
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const setStatusMessage = useCallback((message: string | null) => {
    setStatusBanner(message ? createStatusMessageBanner(message) : null);
  }, []);
  const showTransientBanner = useCallback((params: {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  }) => {
    setStatusBanner({
      message: params.message,
      actionLabel: params.actionLabel,
      onAction: params.onAction,
    });
  }, []);
  return { statusBanner, setStatusBanner, setStatusMessage, showTransientBanner };
}

export function useAppUiState(getDevRuntimeImpact: () => Promise<DevRuntimeImpact>) {
  const [view, setView] = usePersistedState<AppView>('ps_view', 'library');

  useEffect(() => {
    const handleChangeView = (e: Event) => {
      const customEvent = e as CustomEvent<AppView>;
      if (customEvent.detail) {
        setView(customEvent.detail);
      }
    };
    globalThis.addEventListener('change-view', handleChangeView);
    return () => globalThis.removeEventListener('change-view', handleChangeView);
  }, [setView]);
  const [selectedWorkflowId, setSelectedWorkflowId] = usePersistedState<string>('ps_selected_workflow_id', 'folder_ingest_v1');
  const [selectedAssetId, setSelectedAssetId] = usePersistedState<string | null>('ps_selected_asset', null);
  const [showInfoPanel, setShowInfoPanel] = usePersistedState<boolean>('ps_info_panel_open', false);
  const [activeInfoTabRaw, setActiveInfoTab] = usePersistedState<InfoTab>('ps_info_tab', 'profile');
  const activeInfoTab = (activeInfoTabRaw === 'profile' || activeInfoTabRaw === 'people' || activeInfoTabRaw === 'lineage' || activeInfoTabRaw === 'group' || activeInfoTabRaw === 'json' || activeInfoTabRaw === 'ailogs') ? activeInfoTabRaw : 'profile';
  const [theme, setTheme] = usePersistedState<string>('ps_theme', 'dark');
  const [animationsEnabled, setAnimationsEnabled] = usePersistedState<boolean>('ps_animations', true);
  const [aiMode, setAiMode] = usePersistedState<AiMode>('ps_ai_mode', 'live');
  const [showActions, setShowActions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [peopleSelectionCount, setPeopleSelectionCount] = useState(0);
  const [librarySelection, setLibrarySelection] = useState<LibrarySelectionState>(createEmptyLibrarySelectionState());
  const [groupSimilarPhotos, setGroupSimilarPhotos] = usePersistedState<boolean>('ps_group_similar_photos', true);
  const [showGroupIds, setShowGroupIds] = usePersistedState<boolean>('ps_show_group_ids', false);
  const [declusteredAssets, setDeclusteredAssets] = useState<Set<string>>(new Set());
  const [showRejected, setShowRejected] = useState(false);
  const { statusBanner, setStatusBanner, setStatusMessage, showTransientBanner } = useStatusBannerState();
  const [isTaskDrawerMinimized, setIsTaskDrawerMinimized] = useState(true);
  const [hoveredLibraryPhoto, setHoveredLibraryPhoto] = useState<CurrentPhotoStatus | null>(null);
  const devRuntimeImpact = useDevRuntimeImpact(import.meta.env.DEV, getDevRuntimeImpact);

  return {
    view,
    setView,
    selectedWorkflowId,
    setSelectedWorkflowId,
    selectedAssetId,
    setSelectedAssetId,
    showInfoPanel,
    setShowInfoPanel,
    activeInfoTab,
    setActiveInfoTab,
    theme,
    setTheme,
    animationsEnabled,
    setAnimationsEnabled,
    aiMode,
    setAiMode,
    showActions,
    setShowActions,
    showSettings,
    setShowSettings,
    peopleSelectionCount,
    setPeopleSelectionCount,
    librarySelection,
    setLibrarySelection,
    groupSimilarPhotos,
    setGroupSimilarPhotos,
    showGroupIds,
    setShowGroupIds,
    declusteredAssets,
    setDeclusteredAssets,
    showRejected,
    setShowRejected,
    statusBanner,
    setStatusBanner,
    setStatusMessage,
    showTransientBanner,
    isTaskDrawerMinimized,
    setIsTaskDrawerMinimized,
    hoveredLibraryPhoto,
    setHoveredLibraryPhoto,
    devRuntimeImpact,
  };
}
