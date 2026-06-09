import { useEffect, useRef, useState } from 'react';
import { canUseNativeDirectoryPicker } from '@boundary/runtime/backend';

type ActionTab = 'ingest' | 'workflows' | 'library' | 'danger';

type ActionPanelProps = {
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly onScan: (path?: string) => void;
    readonly onPreviews: () => void;
    readonly onDetect: () => void;
    readonly onCluster: () => void;
    readonly onRecalculatePhotoDates: () => Promise<string>;
    readonly onExtractAiMetadata: () => void;
    readonly onScanSensitive: () => void;
    readonly onScanSensitiveAll: () => void;
    readonly onRefresh: () => void;
    readonly onResetFaces: () => void;
    readonly onResetAll: () => void;
    readonly onFactoryReset: () => void;
    readonly onResetGroupingData: () => void;
    readonly onStopScan: () => void;
    readonly onOpenGroupDiagnostics: () => void;
    readonly onStartSimulationWorkflow: (params?: { speed?: string; iterations?: string; errorType?: string; errorRate?: string }) => void;
    readonly folderHistory?: { path: string; last_scanned_at: string }[];
    readonly selectedAssetIds?: string[];
    readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[]) => void;
}

type ActionCardItem = {
    label: string;
    icon: string;
    description: string;
    accentClassName: string;
    disabled?: boolean;
    onClick: () => void;
};

type TabDefinition = {
    id: ActionTab;
    label: string;
    summary: string;
};

const ACTION_TABS: TabDefinition[] = [
    { id: 'ingest', label: 'Ingest', summary: 'Start or stop imports and revisit recent folders.' },
    { id: 'workflows', label: 'Workflows', summary: 'Run the runtime processing flows that operate on your library.' },
    { id: 'library', label: 'Library', summary: 'Refresh views and inspect or reset grouping-related data.' },
    { id: 'danger', label: 'Danger', summary: 'Use carefully for destructive resets and full database cleanup.' },
];

function PanelHeader({ onClose }: { readonly onClose: () => void }) {
    return (
        <div className="mb-6 flex items-center justify-between border-b border-content/10 pb-4">
            <div>
                <h2 className="bg-linear-to-r from-blue-400 to-cyan-300 bg-clip-text text-2xl font-bold text-transparent">Library Actions</h2>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-content-secondary transition-colors hover:bg-surface-secondary hover:text-content" aria-label="Close">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

function TabButton({
    active,
    label,
    onClick,
}: {
    readonly active: boolean;
    readonly label: string;
    readonly onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                active
                    ? 'border-cyan-500/50 bg-cyan-500/15 text-brand-accent'
                    : 'border-content/10 bg-surface-secondary text-content-secondary hover:border-content/30 hover:bg-surface hover:text-content'
            }`}
        >
            {label}
        </button>
    );
}

function ActionCard({
    item,
}: {
    readonly item: ActionCardItem;
}) {
    return (
        <button
            onClick={item.onClick}
            disabled={item.disabled}
            className={`group flex min-h-[132px] w-full flex-col rounded-xl border border-content/10 bg-surface px-4 py-4 text-left motion-safe:transition-all ${
                item.disabled
                    ? 'cursor-not-allowed opacity-45'
                    : `hover:bg-surface-secondary ${item.accentClassName}`
            }`}
        >
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-content">{item.label}</span>
                <span className="text-xl">{item.icon}</span>
            </div>
            <p className="text-xs leading-relaxed text-content-secondary">{item.description}</p>
        </button>
    );
}

function RecentPaths({
    entries,
    onScan,
}: {
    readonly entries: { path: string; last_scanned_at: string }[];
    readonly onScan: (path: string) => void;
}) {
    if (entries.length === 0) {
        return null;
    }

    return (
        <section className="mt-6 rounded-xl border border-content/10 bg-surface-secondary p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-content-secondary">Recent Paths</h3>
                <span className="text-xs uppercase tracking-widest text-content-secondary/65">Quick restart</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {entries.map((entry) => (
                    <button
                        key={entry.path}
                        onClick={() => onScan(entry.path)}
                        className="truncate rounded-lg border border-content/10 bg-surface px-3 py-2 text-left text-xs text-content-secondary transition-colors hover:border-content/30 hover:bg-surface-secondary hover:text-content"
                        title={entry.path}
                    >
                        <span className="mr-2 opacity-65">📁</span>
                        {entry.path.split(/[\\/]/).pop() || entry.path}
                    </button>
                ))}
            </div>
        </section>
    );
}

function ActionGrid({
    items,
}: {
    readonly items: ActionCardItem[];
}) {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => <ActionCard key={item.label} item={item} />)}
        </div>
    );
}

function createCloseThen(onClose: () => void) {
    return (action: () => void) => () => {
        action();
        onClose();
    };
}

function buildIngestItems(
    props: ActionPanelProps,
    closeThen: (action: () => void) => () => void,
    onSelectFolder: () => void,
): ActionCardItem[] {
    return [
        {
            label: 'Select Folder',
            icon: '📂',
            description: 'Choose a directory and start a one-off ingest into the library runtime.',
            accentClassName: 'hover:border-blue-500/50',
            onClick: onSelectFolder,
        },
        {
            label: 'Watched Folder',
            icon: '👀',
            description: 'Reserved for the future auto-ingest flow that watches a folder continuously.',
            accentClassName: '',
            disabled: true,
            onClick: () => undefined,
        },
        {
            label: 'Stop Current Scan',
            icon: '🛑',
            description: 'Cancel the currently running folder ingest workflow and stop polling its progress.',
            accentClassName: 'hover:border-red-500/50',
            onClick: closeThen(props.onStopScan),
        },
    ];
}

function buildWorkflowItems(props: ActionPanelProps, closeThen: (action: () => void) => () => void): ActionCardItem[] {
    return [
        { label: 'Generate Library Previews', icon: '🖼️', description: 'Start the runtime preview workflow for assets missing gallery previews.', accentClassName: 'hover:border-purple-500/50', onClick: closeThen(props.onPreviews) },
        { label: 'Run Face Workflow', icon: '🎯', description: 'Launch the runtime face analysis workflow across the current library.', accentClassName: 'hover:border-purple-500/50', onClick: closeThen(props.onDetect) },
        { label: 'Run Grouping Workflow', icon: '🧬', description: 'Build duplicate, variant, burst, and sequence groupings from the runtime model.', accentClassName: 'hover:border-teal-500/50', onClick: closeThen(props.onCluster) },
        {
            label: 'Recalculate Photo Dates',
            icon: '🗓️',
            description: 'Re-run photo created date estimation across the library using the latest weighting rules.',
            accentClassName: 'hover:border-sky-500/50',
            onClick: closeThen(() => {
                void props.onRecalculatePhotoDates();
            }),
        },
        { label: 'Scan Sensitive Content', icon: '🔞', description: 'Run the runtime sensitive-content workflow for the library.', accentClassName: 'hover:border-amber-500/50', onClick: closeThen(props.onScanSensitive) },
        {
            label: 'Re-run Sensitive Scan',
            icon: '🔁',
            description: 'Force the sensitive-content workflow to run again across the library.',
            accentClassName: 'hover:border-orange-500/50',
            onClick: () => {
                if (globalThis.confirm('This will re-run the sensitive content workflow across the library. Continue?')) {
                    props.onScanSensitiveAll();
                    props.onClose();
                }
            },
        },
        { label: 'Run AI Metadata', icon: '🧠', description: 'Generate captions and semantic metadata with the runtime AI metadata workflow.', accentClassName: 'hover:border-indigo-500/50', onClick: closeThen(props.onExtractAiMetadata) },
        { label: 'Simulate Workflow', icon: '🧪', description: 'Run a mock multi-step workflow to test UI feedback and progress tracking.', accentClassName: 'hover:border-green-500/50', onClick: closeThen(() => props.onStartSimulationWorkflow()) },
    ];
}

function buildLibraryItems(props: ActionPanelProps, closeThen: (action: () => void) => () => void): ActionCardItem[] {
    return [
        { label: 'Refresh Library', icon: '🔄', description: 'Refresh library, people, and workflow dashboard snapshots.', accentClassName: 'hover:border-cyan-500/50', onClick: closeThen(props.onRefresh) },
        { label: 'Grouping Diagnostics Report', icon: '🧪', description: 'Inspect suspicious overlaps, collapse inflation, and group structure.', accentClassName: 'hover:border-cyan-500/50', onClick: closeThen(props.onOpenGroupDiagnostics) },
        {
            label: 'Reset All Grouping Data',
            icon: '♻️',
            description: 'Clear automatic groups, manual canonical picks, and exploded-group history.',
            accentClassName: 'hover:border-amber-500/50',
            onClick: () => {
                if (globalThis.confirm('This will remove automatic grouping results and manual grouping decisions so grouping can be rerun from scratch. Continue?')) {
                    props.onResetGroupingData();
                    props.onClose();
                }
            },
        },
    ];
}

function buildDangerItems(props: ActionPanelProps): ActionCardItem[] {
    return [
        {
            label: 'Soft Reset Database',
            icon: '🧹',
            description: 'Clear operational library data and previews while preserving manual data.',
            accentClassName: 'hover:border-red-500/50',
            onClick: () => {
                if (globalThis.confirm('This will clear the operational library database and generated previews, but keep manual data so it can be re-applied after a rescan. Continue?')) {
                    props.onResetAll();
                    props.onClose();
                }
            },
        },
        {
            label: 'Reset Face Data',
            icon: '🙈',
            description: 'Remove all face detections and related face-analysis results.',
            accentClassName: 'hover:border-red-500/50',
            onClick: () => {
                if (globalThis.confirm('Are you sure you want to reset faces? This will clear all detection data.')) {
                    props.onResetFaces();
                    props.onClose();
                }
            },
        },
        {
            label: 'Factory Reset Database',
            icon: '🔥',
            description: 'Delete the internal database, manual overrides, settings, and generated thumbnails.',
            accentClassName: 'hover:border-red-600/60',
            onClick: () => {
                if (globalThis.confirm('WARNING: This will delete the internal database, manual overrides, manual face naming/isolation data, settings, and generated thumbnails. \n\nIMPORTANT: Your original photo files will NOT be deleted from your computer. \n\nAre you sure you want to proceed?')) {
                    props.onFactoryReset();
                    props.onClose();
                }
            },
        },
    ];
}

function buildTabItems(
    props: ActionPanelProps,
    onSelectFolder: () => void,
): Record<ActionTab, ActionCardItem[]> {
    const closeThen = createCloseThen(props.onClose);
    return {
        ingest: buildIngestItems(props, closeThen, onSelectFolder),
        workflows: buildWorkflowItems(props, closeThen),
        library: buildLibraryItems(props, closeThen),
        danger: buildDangerItems(props),
    };
}

function ManualPathPrompt(props: {
    readonly onScan: (path: string) => void;
    readonly onCancel: () => void;
}) {
    const [manualPath, setManualPath] = useState('');

    return (
        <section className="mt-4 rounded-xl border border-content/10 bg-surface-secondary p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-content-secondary">Folder To Ingest</h3>
            <p className="mt-1 text-xs text-content-secondary">Enter an absolute path (example: C:/Users/robin/Photos)</p>
            <div className="mt-3 flex flex-wrap gap-2">
                <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    aria-label="Folder absolute path to ingest"
                    value={manualPath}
                    onChange={(event) => setManualPath(event.target.value)}
                    placeholder="C:/Users/robin/Photos"
                    className="min-w-72 sm:min-w-full flex-1 rounded-lg border border-content/10 bg-surface px-3 py-2 text-sm text-content"
                />
                <button
                    type="button"
                    onClick={() => {
                        const path = manualPath.trim();
                        if (!path) {return;}
                        props.onScan(path);
                    }}
                    disabled={manualPath.trim().length === 0}
                    className="rounded-lg border border-blue-500/50 bg-blue-500/20 px-3 py-2 text-xs font-semibold text-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Start Ingest
                </button>
                <button
                    type="button"
                    onClick={props.onCancel}
                    className="rounded-lg border border-content/10 bg-surface px-3 py-2 text-xs font-semibold text-content-secondary hover:bg-surface-secondary hover:text-content"
                >
                    Cancel
                </button>
            </div>
        </section>
    );
}

function RunWorkflowSection(props: {
    readonly selectedAssetIds?: string[];
    readonly onRunWorkflowOnAssets?: (workflowId: string, assetIds: string[]) => void;
    readonly onClose: () => void;
}) {
    const [selectedWorkflow, setSelectedWorkflow] = useState('library_previews_v1');
    const selectionCount = props.selectedAssetIds?.length ?? 0;

    return (
        <section className={`mt-6 rounded-xl border border-content/10 bg-surface-secondary p-4 ${selectionCount === 0 ? 'opacity-50' : ''}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-content-secondary">
                    Run Workflow on Selected Photos ({selectionCount} selected)
                </h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <select
                    aria-label="Select workflow to run"
                    value={selectedWorkflow}
                    onChange={(e) => setSelectedWorkflow(e.target.value)}
                    className="min-w-64 rounded-lg border border-content/10 bg-surface px-3 py-2 text-sm text-content"
                    disabled={selectionCount === 0}
                >
                    <option value="library_previews_v1">Generate Previews</option>
                    <option value="library_face_pipeline_v1">Run Face Workflow</option>
                    <option value="library_ai_metadata_v1">Run AI Metadata</option>
                    <option value="library_sensitive_scan_v1">Scan Sensitive Content</option>
                    <option value="library_photo_date_v1">Recalculate Photo Dates</option>
                </select>
                <button
                    type="button"
                    onClick={() => {
                        if (props.selectedAssetIds && props.selectedAssetIds.length > 0) {
                            props.onRunWorkflowOnAssets?.(selectedWorkflow, props.selectedAssetIds);
                            props.onClose();
                        }
                    }}
                    disabled={selectionCount === 0}
                    className="rounded-lg border border-blue-500/50 bg-blue-500/20 px-4 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Run Workflow
                </button>
            </div>
        </section>
    );
}

function ActionPanelTabContent(props: {
    readonly activeTab: ActionTab;
    readonly showManualPathPrompt: boolean;
    readonly tabItems: Record<ActionTab, ActionCardItem[]>;
    readonly actionPanelProps: ActionPanelProps;
    readonly setShowManualPathPrompt: (show: boolean) => void;
}) {
    const { activeTab, showManualPathPrompt, tabItems, actionPanelProps, setShowManualPathPrompt } = props;

    return (
        <>
            <ActionGrid items={tabItems[activeTab]} />
            {activeTab === 'workflows' && (
                <RunWorkflowSection
                    selectedAssetIds={actionPanelProps.selectedAssetIds}
                    onRunWorkflowOnAssets={actionPanelProps.onRunWorkflowOnAssets}
                    onClose={actionPanelProps.onClose}
                />
            )}
            {activeTab === 'ingest' && showManualPathPrompt && (
                <ManualPathPrompt
                    onScan={(path) => {
                        actionPanelProps.onScan(path);
                        setShowManualPathPrompt(false);
                        actionPanelProps.onClose();
                    }}
                    onCancel={() => setShowManualPathPrompt(false)}
                />
            )}
            {activeTab === 'ingest' && (
                <RecentPaths
                    entries={actionPanelProps.folderHistory ?? []}
                    onScan={(path) => {
                        actionPanelProps.onScan(path);
                        actionPanelProps.onClose();
                    }}
                />
            )}
        </>
    );
}

function OpenActionPanel(props: ActionPanelProps) {
    const panelRef = useRef<HTMLDialogElement>(null);
    const [activeTab, setActiveTab] = useState<ActionTab>('ingest');
    const [showManualPathPrompt, setShowManualPathPrompt] = useState(false);
    const supportsNativePicker = canUseNativeDirectoryPicker();
    const handleSelectFolder = () => {
        if (supportsNativePicker) {
            props.onScan();
            props.onClose();
            return;
        }

        setShowManualPathPrompt(true);
    };
    const tabItems = buildTabItems(props, handleSelectFolder);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                props.onClose();
            }
        };

        if (props.isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [props]);

    const activeTabDefinition = ACTION_TABS.find((tab) => tab.id === activeTab) ?? ACTION_TABS[0];

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-4">
            <dialog ref={panelRef} className="mx-auto w-full max-w-6xl rounded-xl border border-content/10 bg-surface/95 p-8 text-content shadow-2xl backdrop-blur-md" open aria-modal="true">
                <PanelHeader onClose={props.onClose} />

                <div className="mb-5 flex flex-wrap gap-2">
                    {ACTION_TABS.map((tab) => (
                        <TabButton key={tab.id} label={tab.label} active={tab.id === activeTab} onClick={() => setActiveTab(tab.id)} />
                    ))}
                </div>

                <div className="mb-5 rounded-xl border border-content/10 bg-surface px-4 py-3">
                    <h3 className="text-sm font-semibold text-content">{activeTabDefinition.label}</h3>
                    <p className="mt-1 text-xs text-content-secondary">{activeTabDefinition.summary}</p>
                </div>

                <ActionPanelTabContent
                    activeTab={activeTab}
                    showManualPathPrompt={showManualPathPrompt}
                    tabItems={tabItems}
                    actionPanelProps={props}
                    setShowManualPathPrompt={setShowManualPathPrompt}
                />
            </dialog>
        </div>
    );
}

export function ActionPanel(props: ActionPanelProps) {
    if (!props.isOpen) {
        return null;
    }

    return <OpenActionPanel key="open-action-panel" {...props} />;
}
