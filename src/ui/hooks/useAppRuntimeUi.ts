import { useEffect, useState } from 'react';
import type { CurrentPhotoStatus } from '@shared/utils/libraryGallery';
import type { DevRuntimeImpact } from '@contracts/devRuntime';
import {
  createEmptyLibrarySelectionState,
  type LibrarySelectionState,
} from '@shared/utils/librarySelectionState';
import { usePersistedState } from './usePersistedState';

export type AppView = 'library' | 'people' | 'dashboard' | 'albums' | 'workflows' | 'groupDiagnostics';
export type InfoTab = 'file' | 'analysis' | 'people' | 'json';
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
    const intervalId = window.setInterval(refreshImpact, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, getDevRuntimeImpact]);

  return devRuntimeImpact;
}

export function useAppUiState(getDevRuntimeImpact: () => Promise<DevRuntimeImpact>) {
  const [view, setView] = usePersistedState<AppView>('ps_view', 'library');
  const [selectedAssetId, setSelectedAssetId] = usePersistedState<string | null>('ps_selected_asset', null);
  const [showInfoPanel, setShowInfoPanel] = usePersistedState<boolean>('ps_info_panel_open', false);
  const [activeInfoTab, setActiveInfoTab] = usePersistedState<InfoTab>('ps_info_tab', 'file');
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isTaskDrawerMinimized, setIsTaskDrawerMinimized] = useState(false);
  const [hoveredLibraryPhoto, setHoveredLibraryPhoto] = useState<CurrentPhotoStatus | null>(null);
  const devRuntimeImpact = useDevRuntimeImpact(import.meta.env.DEV, getDevRuntimeImpact);

  return {
    view,
    setView,
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
    statusMessage,
    setStatusMessage,
    isTaskDrawerMinimized,
    setIsTaskDrawerMinimized,
    hoveredLibraryPhoto,
    setHoveredLibraryPhoto,
    devRuntimeImpact,
  };
}
