import { useMemo } from 'react';
import type { Asset } from '@contracts/core';
import type { LibraryReadinessView } from '@shared/libraryReadiness';
import { usePersistedState } from '../../hooks/usePersistedState';

export function useLibraryReadinessFocus(assets: Asset[]) {
    const [readinessView, setReadinessView] = usePersistedState<'all' | LibraryReadinessView>('ps_library_readiness_view', 'all');
    const readinessAssets = useMemo(() => readinessView === 'all'
        ? assets
        : assets.filter((asset) => asset.library_readiness?.views.includes(readinessView)), [assets, readinessView]);
    return { readinessAssets, readinessView, setReadinessView };
}
