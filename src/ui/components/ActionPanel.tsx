import { useRef, useEffect } from 'react';

interface ActionPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onScan: (path?: string) => void;
    onPreviews: () => void;
    onDetect: () => void;
    onCluster: () => void;
    onExtractAiMetadata: () => void;
    onScanSensitive: () => void;
    onScanSensitiveAll: () => void;
    onRefresh: () => void;
    onResetFaces: () => void;
    onResetAll: () => void;
    onFactoryReset: () => void;
    onResetGroupingData: () => void;
    onStopScan: () => void;
    onBuildGroups: () => void;
    onOpenGroupDiagnostics: () => void;
    onOpenSettings: () => void;
    onOpenWorkflowVisualiser: () => void;
    folderHistory?: { path: string, last_scanned_at: string }[];
}

function PanelHeader({ onClose }: { onClose: () => void }) {
    return (
        <div className="mb-8 flex items-center justify-between border-b border-[#333] pb-4">
            <div>
                <h2 className="bg-linear-to-r from-blue-400 to-purple-400 bg-clip-text text-2xl font-bold text-transparent">Library Actions</h2>
                <p className="mt-1 text-xs text-gray-300">Manage ingestion, runtime workflows, and library maintenance</p>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-gray-400 transition-colors hover:bg-[#333] hover:text-white" aria-label="Close">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

function IngestionColumn(props: Pick<ActionPanelProps, 'onScan' | 'onClose' | 'folderHistory' | 'onStopScan'>) {
    const { onScan, onClose, folderHistory = [], onStopScan } = props;
    return (
        <div className="space-y-6">
            <section>
                <h3 className="mb-4 flex items-center text-xs font-bold uppercase tracking-[0.2em] text-blue-400">
                    <span className="mr-2 h-1.5 w-1.5 rounded-full bg-blue-400" />Ingestion
                </h3>
                <div className="space-y-3">
                    <button onClick={() => { onScan(); onClose(); }} className="group flex w-full flex-col rounded-lg border border-[#333] bg-[#242424] px-4 py-3 text-left transition-all hover:border-blue-500/50 hover:bg-[#2d2d2d]">
                        <span className="font-medium transition-colors group-hover:text-blue-400">Select Folder</span>
                        <span className="text-[10px] text-gray-300">One-off ingest of a directory</span>
                    </button>
                    <button onClick={() => { alert('Watched Folder Ingest coming soon!'); onClose(); }} className="flex w-full cursor-not-allowed flex-col rounded-lg border border-[#333] bg-[#242424]/50 px-4 py-3 text-left opacity-50">
                        <span className="font-medium">Watched Folder</span>
                        <span className="text-[10px] italic text-gray-300">Auto-ingest new files as they arrive</span>
                    </button>
                </div>
            </section>

            {folderHistory.length > 0 && (
                <section>
                    <h4 className="mb-3 px-1 text-[10px] font-black uppercase tracking-widest text-gray-300">Recent Paths</h4>
                    <div className="custom-scrollbar max-h-[200px] space-y-2 overflow-y-auto pr-2">
                        {folderHistory.map((historyEntry, index) => (
                            <button
                                key={index}
                                onClick={() => { onScan(historyEntry.path); onClose(); }}
                                className="w-full truncate rounded-md border border-[#2d2d2d] bg-[#242424] px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:bg-[#333] hover:text-white"
                                title={historyEntry.path}
                            >
                                <span className="mr-2 opacity-65">📁</span>
                                {historyEntry.path.split(/[\\/]/).pop() || historyEntry.path}
                            </button>
                        ))}
                    </div>
                </section>
            )}

            <button onClick={() => { onStopScan(); onClose(); }} className="group mt-4 flex w-full items-center justify-between rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-left text-red-400 transition-all hover:bg-red-900/40">
                <span className="font-semibold">Stop Current Scan</span>
                <span className="rounded-full bg-red-900/60 px-2 py-0.5 text-[9px] font-black text-red-100 transition-colors group-hover:bg-red-800">CANCEL</span>
            </button>
        </div>
    );
}

function PipelineColumn(props: Pick<ActionPanelProps, 'onClose' | 'onPreviews' | 'onDetect' | 'onCluster' | 'onScanSensitive' | 'onScanSensitiveAll' | 'onExtractAiMetadata'>) {
    const { onClose, onPreviews, onDetect, onCluster, onScanSensitive, onScanSensitiveAll, onExtractAiMetadata } = props;
    const actions = [
        { label: 'Generate Library Previews', icon: '🖼️', desc: 'Start the runtime preview workflow for assets missing gallery previews', border: 'hover:border-purple-500/50', onClick: onPreviews },
        { label: 'Run Face Workflow', icon: '🎯', desc: 'Start the runtime face analysis workflow across the current library', border: 'hover:border-purple-500/50', onClick: onDetect },
        { label: 'Run Grouping Workflow', icon: '🧬', desc: 'Build duplicate, variant, burst, and sequence groupings from the runtime model', border: 'hover:border-purple-500/50', onClick: onCluster },
        { label: 'Scan Sensitive Content', icon: '🔞', desc: 'Start the runtime sensitive-content workflow for the library', border: 'hover:border-amber-500/50', onClick: onScanSensitive },
        { label: 'Re-run Sensitive Scan', icon: '🔁', desc: 'Re-run the same runtime sensitive scan workflow across the library', border: 'hover:border-orange-600/50', onClick: () => { if (window.confirm('This will re-run the sensitive content workflow across the library. Continue?')) {onScanSensitiveAll();} } },
        { label: 'Run AI Metadata', icon: '🧠', desc: 'Generate captions and semantic metadata through the runtime AI metadata workflow', border: 'hover:border-indigo-500/50', onClick: onExtractAiMetadata },
    ];

    return (
        <div className="space-y-6">
            <section>
                <h3 className="mb-4 flex items-center text-xs font-bold uppercase tracking-[0.2em] text-purple-400">
                    <span className="mr-2 h-1.5 w-1.5 rounded-full bg-purple-400" />Runtime Workflows
                </h3>
                <div className="grid grid-cols-1 gap-3">
                    {actions.map((action) => (
                        <button key={action.label} onClick={() => { action.onClick(); onClose(); }} className={`group w-full rounded-lg border border-[#333] bg-[#242424] px-4 py-4 text-left transition-all hover:bg-[#2d2d2d] ${action.border}`}>
                            <div className="mb-1 flex items-center justify-between"><span className="font-medium">{action.label}</span><span className="text-lg">{action.icon}</span></div>
                            <p className="text-[10px] leading-relaxed text-gray-300">{action.desc}</p>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}

function AnalysisAndMaintenanceColumn(props: Pick<ActionPanelProps, 'onClose' | 'onBuildGroups' | 'onRefresh' | 'onResetFaces' | 'onResetAll' | 'onFactoryReset' | 'onResetGroupingData' | 'onOpenSettings' | 'onOpenWorkflowVisualiser' | 'onOpenGroupDiagnostics'>) {
    const { onClose, onBuildGroups, onRefresh, onResetFaces, onResetAll, onFactoryReset, onResetGroupingData, onOpenSettings, onOpenWorkflowVisualiser, onOpenGroupDiagnostics } = props;
    return (
        <div className="space-y-8">
            <section>
                <h3 className="mb-4 flex items-center text-xs font-bold uppercase tracking-[0.2em] text-teal-400"><span className="mr-2 h-1.5 w-1.5 rounded-full bg-teal-400" />Relationship Analysis</h3>
                <div className="space-y-3">
                    <button onClick={() => { onBuildGroups(); onClose(); }} className="group w-full rounded-lg border border-[#333] bg-[#242424] px-4 py-4 text-left transition-all hover:border-teal-500/50 hover:bg-[#2d2d2d]"><div className="mb-1 flex items-center justify-between"><span className="font-medium">Run Grouping Workflow</span><span className="text-lg">👯</span></div><p className="text-[10px] leading-relaxed text-gray-300">Build duplicate, variant, burst, and sequence groups from the runtime workflow</p></button>
                    <button onClick={() => { onOpenGroupDiagnostics(); onClose(); }} className="group w-full rounded-lg border border-[#333] bg-[#242424] px-4 py-4 text-left transition-all hover:border-cyan-500/50 hover:bg-[#2d2d2d]"><div className="mb-1 flex items-center justify-between"><span className="font-medium">Grouping Diagnostics Report</span><span className="text-lg">🧪</span></div><p className="text-[10px] leading-relaxed text-gray-300">Inspect suspicious overlaps, collapse inflation, and group structure</p></button>
                    <button onClick={() => { if (window.confirm('This will remove automatic grouping results and manual grouping decisions so grouping can be rerun from scratch. Continue?')) { onResetGroupingData(); onClose(); } }} className="group w-full rounded-lg border border-[#333] bg-[#242424] px-4 py-4 text-left transition-all hover:border-amber-500/50 hover:bg-[#2d2d2d]"><div className="mb-1 flex items-center justify-between"><span className="font-medium">Reset All Grouping Data</span><span className="text-lg">♻️</span></div><p className="text-[10px] leading-relaxed text-gray-300">Clear automatic groups, manual canonical picks, and exploded-group history</p></button>
                </div>
            </section>

            <section>
                <h3 className="mb-4 flex items-center text-xs font-bold uppercase tracking-[0.2em] text-gray-300"><span className="mr-2 h-1.5 w-1.5 rounded-full bg-gray-300" />Maintenance</h3>
                <button onClick={() => { onOpenWorkflowVisualiser(); onClose(); }} className="group mb-3 w-full rounded-lg border border-[#333] bg-[#242424] px-4 py-4 text-left transition-all hover:bg-[#2d2d2d]"><div className="mb-1 flex items-center justify-between"><span className="font-medium">Workflow Visualiser</span><span className="text-lg">🗺️</span></div><p className="text-[10px] leading-relaxed text-gray-300">Open the dedicated workflow workspace for runtime-native orchestration</p></button>
                <button onClick={() => { onOpenSettings(); onClose(); }} className="group mb-3 w-full rounded-lg border border-[#333] bg-[#242424] px-4 py-4 text-left transition-all hover:bg-[#2d2d2d]"><div className="mb-1 flex items-center justify-between"><span className="font-medium">Application Settings</span><span className="text-lg">⚙️</span></div><p className="text-[10px] leading-relaxed text-gray-300">Open the settings dialog for UI and database configuration</p></button>
                <button onClick={() => { onRefresh(); onClose(); }} className="group w-full rounded-lg border border-[#333] bg-[#242424] px-4 py-4 text-left transition-all hover:bg-[#2d2d2d]"><div className="mb-1 flex items-center justify-between"><span className="font-medium">Refresh Library</span><span className="text-lg">🔄</span></div><p className="text-[10px] leading-relaxed text-gray-300">Refresh library, people, and workflow dashboard snapshots</p></button>
            </section>

            <section className="border-t border-[#333] pt-6">
                <h3 className="mb-4 flex items-center text-xs font-bold uppercase tracking-[0.2em] text-red-500"><span className="mr-2 h-1.5 w-1.5 rounded-full bg-red-500" />Danger Zone</h3>
                <div className="space-y-3">
                    <button onClick={() => { if (window.confirm('Are you sure you want to reset faces? This will clear all detection data.')) { onResetFaces(); onClose(); } }} className="w-full rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 text-left text-sm font-medium text-red-200 transition-all hover:bg-red-900/30">Reset Face Data</button>
                    <button onClick={() => { if (window.confirm('This will clear the operational library database and generated previews, but keep manual data so it can be re-applied after a rescan. Continue?')) { onResetAll(); onClose(); } }} className="w-full rounded-lg border border-red-900/40 bg-red-950/30 px-4 py-3 text-left text-sm font-semibold text-red-100 transition-all hover:bg-red-900/45">Soft Reset Database</button>
                    <button onClick={() => { if (window.confirm('WARNING: This will delete the internal database, manual overrides, manual face naming/isolation data, settings, and generated thumbnails. \n\nIMPORTANT: Your original photo files will NOT be deleted from your computer. \n\nAre you sure you want to proceed?')) { onFactoryReset(); onClose(); } }} className="w-full rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-3 text-left text-sm font-bold text-red-100 transition-all hover:bg-red-900/60">Factory Reset Database</button>
                </div>
            </section>
        </div>
    );
}

export function ActionPanel(props: ActionPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const { isOpen, onClose } = props;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {onClose();}
        };
        if (isOpen) {document.addEventListener('mousedown', handleClickOutside);}
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) {return null;}

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div ref={panelRef} className="mx-4 w-full max-w-5xl rounded-xl border border-[#333] bg-[#1a1a1a]/95 p-8 text-white shadow-2xl backdrop-blur-md" role="dialog" aria-modal="true">
                <PanelHeader onClose={onClose} />
                <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
                    <IngestionColumn onScan={props.onScan} onClose={props.onClose} folderHistory={props.folderHistory} onStopScan={props.onStopScan} />
                    <PipelineColumn onClose={props.onClose} onPreviews={props.onPreviews} onDetect={props.onDetect} onCluster={props.onCluster} onScanSensitive={props.onScanSensitive} onScanSensitiveAll={props.onScanSensitiveAll} onExtractAiMetadata={props.onExtractAiMetadata} />
                    <AnalysisAndMaintenanceColumn onClose={props.onClose} onBuildGroups={props.onBuildGroups} onRefresh={props.onRefresh} onResetFaces={props.onResetFaces} onResetAll={props.onResetAll} onFactoryReset={props.onFactoryReset} onResetGroupingData={props.onResetGroupingData} onOpenGroupDiagnostics={props.onOpenGroupDiagnostics} onOpenSettings={props.onOpenSettings} onOpenWorkflowVisualiser={props.onOpenWorkflowVisualiser} />
                </div>
            </div>
        </div>
    );
}
