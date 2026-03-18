import { useState, useEffect } from 'react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    getSetting: (key: string) => Promise<string>;
    setSetting: (key: string, value: string) => Promise<void>;
    theme: string;
    setTheme: (v: string) => void;
    animationsEnabled: boolean;
    setAnimationsEnabled: (v: boolean) => void;
}

type Tab = 'system' | 'ui' | 'workflows' | 'jobs';
type SettingsMap = { [key: string]: string };

const dbKeys = [
    'system_log_level', 'system_max_threads', 'workflow_auto_scan',
    'ai_metadata_v2_api_key', 'gemini_api_key', 'gemini_csv_path', 'job_cluster_threshold',
];

const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'system', label: 'System Settings' },
    { id: 'ui', label: 'UI Settings' },
    { id: 'workflows', label: 'Workflows' },
    { id: 'jobs', label: 'Registered Jobs' },
];

function TabButton({ activeTab, tab, label, onClick }: { activeTab: Tab; tab: Tab; label: string; onClick: (tab: Tab) => void }) {
    return (
        <button
            onClick={() => onClick(tab)}
            className={`px-6 py-3 text-left font-medium transition-colors ${activeTab === tab ? 'bg-[#2a5] text-white' : 'text-gray-300 hover:bg-[#222] hover:text-white'}`}
        >
            {label}
        </button>
    );
}

function SystemTab({ dbSettings, onChange }: { dbSettings: SettingsMap; onChange: (k: string, v: string) => void }) {
    return (
        <div className="space-y-6">
            <h3 className="border-b border-[#333] pb-2 text-lg font-semibold text-blue-400">System Settings</h3>
            <p className="mb-4 text-xs text-gray-300">Stored securely in the underlying database.</p>
            <div className="space-y-4">
                <div>
                    <label className="mb-1 block text-xs font-medium text-gray-300">Log Level</label>
                    <select value={dbSettings.system_log_level || 'info'} onChange={(e) => onChange('system_log_level', e.target.value)} className="w-full rounded border border-[#333] bg-[#111] px-3 py-2 text-sm outline-none focus:border-[#2a5]">
                        <option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warn</option><option value="error">Error</option>
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-gray-300">Maximum Worker Threads (Example)</label>
                    <input type="number" value={dbSettings.system_max_threads || '4'} onChange={(e) => onChange('system_max_threads', e.target.value)} className="w-full rounded border border-[#333] bg-[#111] px-3 py-2 text-sm outline-none focus:border-[#2a5]" />
                </div>
            </div>
        </div>
    );
}

function UiTab({
    theme, setTheme, animationsEnabled, setAnimationsEnabled,
}: Pick<SettingsModalProps, 'theme' | 'setTheme' | 'animationsEnabled' | 'setAnimationsEnabled'>) {
    return (
        <div className="space-y-6">
            <h3 className="border-b border-[#333] pb-2 text-lg font-semibold text-pink-400">UI Settings</h3>
            <p className="mb-4 text-xs text-gray-300">Persisted locally in the browser/client storage.</p>
            <div className="space-y-4">
                <div>
                    <label className="mb-1 block text-xs font-medium text-gray-300">Color Theme</label>
                    <select value={theme} onChange={(e) => setTheme(e.target.value)} className="w-full rounded border border-[#333] bg-[#111] px-3 py-2 text-sm outline-none focus:border-[#2a5]">
                        <option value="dark">Dark Theme (Default)</option><option value="light">Light Theme (Preview)</option>
                    </select>
                </div>
                <div className="flex items-center gap-3">
                    <input type="checkbox" id="ui_anim" checked={animationsEnabled} onChange={(e) => setAnimationsEnabled(e.target.checked)} className="h-4 w-4 rounded border-[#333] bg-[#111] text-[#2a5] focus:ring-[#2a5]" />
                    <label htmlFor="ui_anim" className="text-sm font-medium text-gray-300">Enable smooth UI animations</label>
                </div>
            </div>
        </div>
    );
}

function WorkflowsTab({ dbSettings, onChange }: { dbSettings: SettingsMap; onChange: (k: string, v: string) => void }) {
    return (
        <div className="space-y-6">
            <h3 className="border-b border-[#333] pb-2 text-lg font-semibold text-orange-400">Workflows</h3>
            <p className="mb-4 text-xs text-gray-300">Runtime workflow settings.</p>
            <div className="space-y-4">
                <div>
                    <label className="mb-1 block text-xs font-medium text-gray-300">Auto-Scan Strategy</label>
                    <select value={dbSettings.workflow_auto_scan || 'manual'} onChange={(e) => onChange('workflow_auto_scan', e.target.value)} className="w-full rounded border border-[#333] bg-[#111] px-3 py-2 text-sm outline-none focus:border-[#2a5]">
                        <option value="manual">Manual Only</option><option value="startup">Scan watched folders on Startup</option>
                    </select>
                </div>
                <div className="rounded-lg border border-[#333] bg-[#242424] p-4 text-xs text-gray-300">
                    Library processing now runs entirely through workflow-runtime definitions. Legacy module toggles and stage override JSON settings have been removed.
                </div>
            </div>
        </div>
    );
}

function AiJobSection({ dbSettings, onChange }: { dbSettings: SettingsMap; onChange: (k: string, v: string) => void }) {
    return (
        <div className="space-y-4 rounded-lg border border-[#333] bg-[#242424] p-4">
            <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-300">AI Metadata V2 API Key</label>
                <input id="setting-ai-metadata-v2-api-key" type="password" value={dbSettings.ai_metadata_v2_api_key || ''} onChange={(e) => onChange('ai_metadata_v2_api_key', e.target.value)} placeholder="AIzaSy..." className="w-full rounded border border-[#333] bg-[#111] px-3 py-2 text-sm outline-none focus:border-purple-500" />
                <p className="mt-1 text-[10px] text-gray-300">Preferred by the runtime AI metadata module. Falls back to the Gemini key if left blank.</p>
            </div>
            <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-300">Gemini API Key</label>
                <input id="setting-gemini-api-key" type="password" value={dbSettings.gemini_api_key || ''} onChange={(e) => onChange('gemini_api_key', e.target.value)} placeholder="AIzaSy..." className="w-full rounded border border-[#333] bg-[#111] px-3 py-2 text-sm outline-none focus:border-purple-500" />
                <p className="mt-1 text-[10px] text-gray-300">Optional fallback key for Gemini-backed runtime metadata execution. Get a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">aistudio.google.com/apikey</a></p>
            </div>
            <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-300">Kinship Explorer CSV Path</label>
                <input type="text" value={dbSettings.gemini_csv_path || ''} onChange={(e) => onChange('gemini_csv_path', e.target.value)} placeholder="C:/Path/To/Names.csv" className="w-full rounded border border-[#333] bg-[#111] px-3 py-2 text-sm outline-none focus:border-purple-500" />
                <p className="mt-1 text-[10px] text-gray-300">Used to identify people across generations</p>
            </div>
        </div>
    );
}

function ClusterJobSection({ dbSettings, onChange }: { dbSettings: SettingsMap; onChange: (k: string, v: string) => void }) {
    return (
        <div className="space-y-4 rounded-lg border border-[#333] bg-[#242424] p-4">
            <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-300">Cluster Distance Threshold</label>
                <input type="number" step="0.01" value={dbSettings.job_cluster_threshold || '0.55'} onChange={(e) => onChange('job_cluster_threshold', e.target.value)} className="w-full rounded border border-[#333] bg-[#111] px-3 py-2 text-sm outline-none focus:border-purple-500" />
                <p className="mt-1 text-[10px] text-gray-300">Lower values mean stricter clustering. Default is usually ~0.55.</p>
            </div>
        </div>
    );
}

function JobsTab({ dbSettings, onChange }: { dbSettings: SettingsMap; onChange: (k: string, v: string) => void }) {
    return (
        <div className="space-y-8">
            <div><h3 className="mb-4 border-b border-[#333] pb-2 text-lg font-semibold text-purple-400">Workflow: library_ai_metadata_v1</h3><AiJobSection dbSettings={dbSettings} onChange={onChange} /></div>
            <div><h3 className="mb-4 border-b border-[#333] pb-2 text-lg font-semibold text-purple-400">Workflow: library_grouping_v1</h3><ClusterJobSection dbSettings={dbSettings} onChange={onChange} /></div>
        </div>
    );
}

function loadDbSettings(getSetting: SettingsModalProps['getSetting']): Promise<SettingsMap> {
    return Promise.all(
        dbKeys.map((key) => getSetting(key).then((val) => ({ key, val })).catch(() => ({ key, val: '' })))
    ).then((results) => {
        const next: SettingsMap = {};
        results.forEach((result) => {
            next[result.key] = result.val;
        });
        return next;
    });
}

function useDbSettingsLoader(
    isOpen: boolean,
    getSetting: SettingsModalProps['getSetting'],
    setDbSettings: React.Dispatch<React.SetStateAction<SettingsMap>>,
    setSaveStatus: React.Dispatch<React.SetStateAction<string | null>>,
) {
    useEffect(() => {
        if (!isOpen) {
            return;
        }

        void loadDbSettings(getSetting).then((nextSettings) => {
            setDbSettings(nextSettings);
            setSaveStatus(null);
        });
    }, [getSetting, isOpen, setDbSettings, setSaveStatus]);
}

function useDbSettingsSaver(
    dbSettings: SettingsMap,
    setSetting: SettingsModalProps['setSetting'],
    setSaveStatus: React.Dispatch<React.SetStateAction<string | null>>,
) {
    return async () => {
        setSaveStatus('Saving...');
        try {
            for (const key of dbKeys) {
                await setSetting(key, dbSettings[key] || '');
            }
            setSaveStatus('Saved \u2713');
        } catch {
            setSaveStatus('Error saving');
        } finally {
            setTimeout(() => setSaveStatus(null), 2000);
        }
    };
}

function SettingsSidebar({
    activeTab,
    onChange,
}: {
    activeTab: Tab;
    onChange: (tab: Tab) => void;
}) {
    return (
        <div className="flex w-64 flex-col border-r border-[#333] bg-[#111] py-4">
            {tabs.map((tab) => (
                <TabButton key={tab.id} activeTab={activeTab} tab={tab.id} label={tab.label} onClick={onChange} />
            ))}
        </div>
    );
}

function SettingsContent({
    activeTab,
    dbSettings,
    onDbChange,
    theme,
    setTheme,
    animationsEnabled,
    setAnimationsEnabled,
}: {
    activeTab: Tab;
    dbSettings: SettingsMap;
    onDbChange: (k: string, v: string) => void;
    theme: string;
    setTheme: (v: string) => void;
    animationsEnabled: boolean;
    setAnimationsEnabled: (v: boolean) => void;
}) {
    if (activeTab === 'system') {
        return <SystemTab dbSettings={dbSettings} onChange={onDbChange} />;
    }

    if (activeTab === 'ui') {
        return (
            <UiTab
                theme={theme}
                setTheme={setTheme}
                animationsEnabled={animationsEnabled}
                setAnimationsEnabled={setAnimationsEnabled}
            />
        );
    }

    if (activeTab === 'workflows') {
        return <WorkflowsTab dbSettings={dbSettings} onChange={onDbChange} />;
    }

    return <JobsTab dbSettings={dbSettings} onChange={onDbChange} />;
}

function SettingsFooter({
    activeTab,
    saveStatus,
    onSave,
}: {
    activeTab: Tab;
    saveStatus: string | null;
    onSave: () => void;
}) {
    if (activeTab === 'ui') {
        return null;
    }

    return (
        <div className="flex items-center justify-end border-t border-[#333] bg-[#222] px-6 py-4">
            {saveStatus && <span className={`mr-4 text-sm ${saveStatus.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>{saveStatus}</span>}
            <button onClick={onSave} className="rounded bg-[#2a5] px-6 py-2 font-medium text-white shadow-sm transition-colors hover:bg-[#228b22]">Save DB Settings</button>
        </div>
    );
}

export function SettingsModal({
    isOpen, onClose, getSetting, setSetting,
    theme, setTheme, animationsEnabled, setAnimationsEnabled,
}: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<Tab>('system');
    const [dbSettings, setDbSettings] = useState<SettingsMap>({});
    const [saveStatus, setSaveStatus] = useState<string | null>(null);

    useDbSettingsLoader(isOpen, getSetting, setDbSettings, setSaveStatus);

    const handleDbChange = (key: string, value: string) => setDbSettings((prev) => ({ ...prev, [key]: value }));
    const handleSaveDbSettings = useDbSettingsSaver(dbSettings, setSetting, setSaveStatus);

    if (!isOpen) {return null;}

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
            <div className="flex h-[720px] max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#333] bg-[#1a1a1a] text-gray-200 shadow-2xl">
                <div className="flex items-center justify-between border-b border-[#333] bg-[#222] px-6 py-4">
                    <div className="flex items-center gap-3"><span className="text-xl">⚙️</span><h2 className="text-xl font-bold">Settings</h2></div>
                    <button onClick={onClose} className="text-gray-400 transition-colors hover:text-white" aria-label="Close Settings">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 overflow-hidden">
                    <SettingsSidebar activeTab={activeTab} onChange={setActiveTab} />

                    <div className="min-h-0 flex-1 overflow-y-auto bg-[#1a1a1a] p-6">
                        <SettingsContent
                            activeTab={activeTab}
                            dbSettings={dbSettings}
                            onDbChange={handleDbChange}
                            theme={theme}
                            setTheme={setTheme}
                            animationsEnabled={animationsEnabled}
                            setAnimationsEnabled={setAnimationsEnabled}
                        />
                    </div>
                </div>

                <SettingsFooter activeTab={activeTab} saveStatus={saveStatus} onSave={handleSaveDbSettings} />
            </div>
        </div>
    );
}
