import { useRef, useEffect } from 'react';

interface ActionPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onScan: (path?: string) => void;
    onPreviews: () => void;
    onDetect: () => void;
    onRecognise: () => void;
    onCluster: () => void;
    onExtractAiMetadata: () => void;
    onScanSensitive: () => void;
    onScanSensitiveAll: () => void;
    onRefresh: () => void;
    onResetFaces: () => void;
    onResetAll: () => void;
    onFactoryReset: () => void;
    onStopScan: () => void;
    onBuildGroups: () => void;
    onBuildBursts: () => void;
    onOpenSettings: () => void;
    folderHistory?: { path: string, last_scanned_at: string }[];
}

function PanelHeader({ onClose }: { onClose: () => void }) {
    return (
        <div className="flex justify-between items-center mb-8 border-b border-[#333] pb-4">
            <div>
                <h2 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Library Actions</h2>
                <p className="text-xs text-gray-300 mt-1">Manage ingestion, processing and library maintenance</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-[#333] transition-colors text-gray-400 hover:text-white" aria-label="Close">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-[0.2em] mb-4 flex items-center">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2" />Ingestion
                </h3>
                <div className="space-y-3">
                    <button onClick={() => { onScan(); onClose(); }} className="w-full text-left px-4 py-3 bg-[#242424] hover:bg-[#2d2d2d] border border-[#333] hover:border-blue-500/50 rounded-lg transition-all flex flex-col group">
                        <span className="font-medium group-hover:text-blue-400 transition-colors">Select Folder</span>
                        <span className="text-[10px] text-gray-300">One-off ingest of a directory</span>
                    </button>
                    <button onClick={() => { alert('Watched Folder Ingest coming soon!'); onClose(); }} className="w-full text-left px-4 py-3 bg-[#242424]/50 border border-[#333] rounded-lg flex flex-col opacity-50 cursor-not-allowed">
                        <span className="font-medium">Watched Folder</span>
                        <span className="text-[10px] text-gray-300 italic">Auto-ingest new files as they arrive</span>
                    </button>
                </div>
            </section>

            {folderHistory.length > 0 && (
                <section>
                    <h4 className="text-[10px] text-gray-300 uppercase font-black tracking-widest px-1 mb-3">Recent Paths</h4>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                        {folderHistory.map((h, i) => (
                            <button key={i} onClick={() => { onScan(h.path); onClose(); }} className="w-full text-left px-3 py-2 text-xs bg-[#242424] hover:bg-[#333] border border-[#2d2d2d] rounded-md truncate text-gray-300 hover:text-white transition-colors" title={h.path}>
                                <span className="text-gray-300 mr-2 opacity-65">📁</span>{h.path.split(/[\\/]/).pop() || h.path}
                            </button>
                        ))}
                    </div>
                </section>
            )}

            <button onClick={() => { onStopScan(); onClose(); }} className="w-full text-left px-4 py-3 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 rounded-lg text-red-400 flex items-center justify-between transition-all mt-4 group">
                <span className="font-semibold">Stop Current Scan</span>
                <span className="text-[9px] bg-red-900/60 px-2 py-0.5 rounded-full text-red-100 font-black group-hover:bg-red-800 transition-colors">CANCEL</span>
            </button>
        </div>
    );
}

function PipelineColumn(props: Pick<ActionPanelProps, 'onClose' | 'onPreviews' | 'onDetect' | 'onRecognise' | 'onCluster' | 'onScanSensitive' | 'onScanSensitiveAll' | 'onExtractAiMetadata'>) {
    const { onClose, onPreviews, onDetect, onRecognise, onCluster, onScanSensitive, onScanSensitiveAll, onExtractAiMetadata } = props;
    const actions = [
        { label: 'Generate Previews', icon: '🖼️', desc: 'Optimize images for fast gallery browsing', border: 'hover:border-purple-500/50', onClick: onPreviews },
        { label: 'Detect Faces', icon: '🎯', desc: 'Locate people within your photo collection', border: 'hover:border-purple-500/50', onClick: onDetect },
        { label: 'Recognise Faces', icon: '👤', desc: 'Identify known individuals across library', border: 'hover:border-purple-500/50', onClick: onRecognise },
        { label: 'Cluster Faces', icon: '🧬', desc: 'Group similar faces into discovery clusters', border: 'hover:border-purple-500/50', onClick: onCluster },
        { label: 'Scan Sensitive Content', icon: '🔞', desc: 'Detect NSFW content locally (unscanned only)', border: 'hover:border-amber-500/50', onClick: onScanSensitive },
        { label: 'Force Re-scan All Images', icon: '🔁', desc: 'Clear existing scores & re-run on every asset', border: 'hover:border-orange-600/50', onClick: () => { if (window.confirm('This will clear and re-run the sensitive content scan over ALL images in the library. This may take a long time. Continue?')) {onScanSensitiveAll();} } },
        { label: 'Run AI Metadata V2', icon: '🧠', desc: 'Use the Gemini replacement pipeline to generate rich captions and semantic metadata', border: 'hover:border-indigo-500/50', onClick: onExtractAiMetadata }
    ];

    return (
        <div className="space-y-6">
            <section>
                <h3 className="text-xs font-bold text-purple-400 uppercase tracking-[0.2em] mb-4 flex items-center">
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full mr-2" />AI Pipeline
                </h3>
                <div className="grid grid-cols-1 gap-3">
                    {actions.map(action => (
                        <button key={action.label} onClick={() => { action.onClick(); onClose(); }} className={`w-full text-left px-4 py-4 bg-[#242424] hover:bg-[#2d2d2d] border border-[#333] ${action.border} rounded-lg transition-all group`}>
                            <div className="flex items-center justify-between mb-1"><span className="font-medium">{action.label}</span><span className="text-lg">{action.icon}</span></div>
                            <p className="text-[10px] text-gray-300 leading-relaxed">{action.desc}</p>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}

function AnalysisAndMaintenanceColumn(props: Pick<ActionPanelProps, 'onClose' | 'onBuildGroups' | 'onBuildBursts' | 'onRefresh' | 'onResetFaces' | 'onResetAll' | 'onFactoryReset' | 'onOpenSettings'>) {
    const { onClose, onBuildGroups, onBuildBursts, onRefresh, onResetFaces, onResetAll, onFactoryReset, onOpenSettings } = props;
    return (
        <div className="space-y-8">
            <section>
                <h3 className="text-xs font-bold text-teal-400 uppercase tracking-[0.2em] mb-4 flex items-center"><span className="w-1.5 h-1.5 bg-teal-400 rounded-full mr-2" />Relationship Analysis</h3>
                <div className="space-y-3">
                    <button onClick={() => { onBuildGroups(); onClose(); }} className="w-full text-left px-4 py-4 bg-[#242424] hover:bg-[#2d2d2d] border border-[#333] hover:border-teal-500/50 rounded-lg transition-all group"><div className="flex items-center justify-between mb-1"><span className="font-medium">Group Duplicates & Variants</span><span className="text-lg">👯</span></div><p className="text-[10px] text-gray-300 leading-relaxed">Automatically stack identical files and similar versions (variants)</p></button>
                    <button onClick={() => { onBuildBursts(); onClose(); }} className="w-full text-left px-4 py-4 bg-[#242424] hover:bg-[#2d2d2d] border border-[#333] hover:border-teal-500/50 rounded-lg transition-all group"><div className="flex items-center justify-between mb-1"><span className="font-medium">Group Bursts & Sequences</span><span className="text-lg">📸</span></div><p className="text-[10px] text-gray-300 leading-relaxed">Automatically group rapid-fire photo sequences</p></button>
                </div>
            </section>

            <section>
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-[0.2em] mb-4 flex items-center"><span className="w-1.5 h-1.5 bg-gray-300 rounded-full mr-2" />Maintenance</h3>
                <button onClick={() => { onOpenSettings(); onClose(); }} className="w-full text-left px-4 py-4 bg-[#242424] hover:bg-[#2d2d2d] border border-[#333] rounded-lg transition-all group mb-3"><div className="flex items-center justify-between mb-1"><span className="font-medium">Application Settings</span><span className="text-lg">⚙️</span></div><p className="text-[10px] text-gray-300 leading-relaxed">Open the settings dialog for UI and database configuration</p></button>
                <button onClick={() => { onRefresh(); onClose(); }} className="w-full text-left px-4 py-4 bg-[#242424] hover:bg-[#2d2d2d] border border-[#333] rounded-lg transition-all group"><div className="flex items-center justify-between mb-1"><span className="font-medium">Refresh Library</span><span className="text-lg">🔄</span></div><p className="text-[10px] text-gray-300 leading-relaxed">Sync database with filesystem changes</p></button>
            </section>

            <section className="pt-6 border-t border-[#333]">
                <h3 className="text-xs font-bold text-red-500 uppercase tracking-[0.2em] mb-4 flex items-center"><span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2" />Danger Zone</h3>
                <div className="space-y-3">
                    <button onClick={() => { if (window.confirm('Are you sure you want to reset faces? This will clear all detection data.')) { onResetFaces(); onClose(); } }} className="w-full text-left px-4 py-3 bg-red-950/20 hover:bg-red-900/30 border border-red-900/40 rounded-lg text-red-200 transition-all text-sm font-medium">Reset Face Data</button>
                    <button onClick={() => { if (window.confirm('This will clear the operational library database and generated previews, but keep manual data so it can be re-applied after a rescan. Continue?')) { onResetAll(); onClose(); } }} className="w-full text-left px-4 py-3 bg-red-950/30 hover:bg-red-900/45 border border-red-900/40 rounded-lg text-red-100 transition-all text-sm font-semibold">Soft Reset Database</button>
                    <button onClick={() => { if (window.confirm('WARNING: This will delete the internal database, manual overrides, manual face naming/isolation data, settings, and generated thumbnails. \n\nIMPORTANT: Your original photo files will NOT be deleted from your computer. \n\nAre you sure you want to proceed?')) { onFactoryReset(); onClose(); } }} className="w-full text-left px-4 py-3 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 rounded-lg text-red-100 transition-all text-sm font-bold">Factory Reset Database</button>
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
            <div ref={panelRef} className="bg-[#1a1a1a]/95 backdrop-blur-md border border-[#333] rounded-xl shadow-2xl p-8 w-full max-w-5xl text-white mx-4" role="dialog" aria-modal="true">
                <PanelHeader onClose={onClose} />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                    <IngestionColumn onScan={props.onScan} onClose={props.onClose} folderHistory={props.folderHistory} onStopScan={props.onStopScan} />
                    <PipelineColumn onClose={props.onClose} onPreviews={props.onPreviews} onDetect={props.onDetect} onRecognise={props.onRecognise} onCluster={props.onCluster} onScanSensitive={props.onScanSensitive} onScanSensitiveAll={props.onScanSensitiveAll} onExtractAiMetadata={props.onExtractAiMetadata} />
                    <AnalysisAndMaintenanceColumn onClose={props.onClose} onBuildGroups={props.onBuildGroups} onBuildBursts={props.onBuildBursts} onRefresh={props.onRefresh} onResetFaces={props.onResetFaces} onResetAll={props.onResetAll} onFactoryReset={props.onFactoryReset} onOpenSettings={props.onOpenSettings} />
                </div>
            </div>
        </div>
    );
}
