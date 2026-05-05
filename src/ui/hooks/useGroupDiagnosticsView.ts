import { useCallback, useEffect, useState } from 'react';
import type { GroupDiagnosticsReport } from '@contracts/groupDiagnostics';
import type { AppView } from './useAppRuntimeUi';

type UseGroupDiagnosticsViewParams = {
    getGroupDiagnosticsReport: () => Promise<GroupDiagnosticsReport>;
    view: AppView;
}

export function useGroupDiagnosticsView(params: UseGroupDiagnosticsViewParams) {
    const { getGroupDiagnosticsReport, view } = params;
    const [groupDiagnosticsReport, setGroupDiagnosticsReport] = useState<GroupDiagnosticsReport | null>(null);
    const [isLoadingGroupDiagnostics, setIsLoadingGroupDiagnostics] = useState(false);

    const loadGroupDiagnosticsReport = useCallback(async () => {
        setIsLoadingGroupDiagnostics(true);
        try {
            const report = await getGroupDiagnosticsReport();
            setGroupDiagnosticsReport(report);
        } finally {
            setIsLoadingGroupDiagnostics(false);
        }
    }, [getGroupDiagnosticsReport]);

    useEffect(() => {
        if (view !== 'groupDiagnostics' || groupDiagnosticsReport || isLoadingGroupDiagnostics) {return;}
        void loadGroupDiagnosticsReport();
    }, [groupDiagnosticsReport, isLoadingGroupDiagnostics, loadGroupDiagnosticsReport, view]);

    return {
        groupDiagnosticsReport,
        isLoadingGroupDiagnostics,
        loadGroupDiagnosticsReport,
    };
}
