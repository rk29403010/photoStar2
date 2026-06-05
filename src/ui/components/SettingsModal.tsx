import { useState, useEffect } from 'react';
import type { AiMode } from '@ui/hooks/useAppRuntimeUi';
import { Button, Input, Select, Checkbox, Card } from './Primitives';

type SettingsModalProps = {
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly getSetting: (key: string) => Promise<string>;
    readonly setSetting: (key: string, value: string) => Promise<void>;
    readonly theme: string;
    readonly setTheme: (v: string) => void;
    readonly animationsEnabled: boolean;
    readonly setAnimationsEnabled: (v: boolean) => void;
    readonly aiMode: AiMode;
    readonly setAiMode: (mode: AiMode) => void;
}

type Tab = 'system' | 'ui' | 'workflows' | 'jobs';
type FaceMatchingMode = 'strict' | 'balanced' | 'loose';
type SettingsMap = { [key: string]: string };

const dbKeys = [
    'system_log_level', 'system_max_threads', 'workflow_auto_scan',
    'ai_metadata_v2_api_key', 'gemini_api_key', 'gemini_csv_path', 'job_cluster_threshold', 'job_face_matching_mode',
    'job_ai_model_scout', 'job_ai_model_refine',
];

const FACE_MATCHING_MODE_OPTIONS: Array<{ value: FaceMatchingMode; label: string; description: string }> = [
    { value: 'strict', label: 'Strict', description: 'Prioritizes fewer false matches.' },
    { value: 'balanced', label: 'Balanced', description: 'Default blend of precision and recall.' },
    { value: 'loose', label: 'Loose', description: 'Allows broader grouping when needed.' },
];

const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'system', label: 'System Settings' },
    { id: 'ui', label: 'UI Settings' },
    { id: 'workflows', label: 'Workflows' },
    { id: 'jobs', label: 'Registered Jobs' },
];

function TabButton({ activeTab, tab, label, onClick }: { readonly activeTab: Tab; readonly tab: Tab; readonly label: string; readonly onClick: (tab: Tab) => void }) {
    const isActive = activeTab === tab;
    return (
        <button
            onClick={() => onClick(tab)}
            className={`w-full px-6 py-3 text-left font-medium transition-colors ${
                isActive 
                    ? 'bg-brand-accent text-white font-semibold' 
                    : 'text-content-secondary hover:bg-surface-secondary hover:text-content'
            }`}
        >
            {label}
        </button>
    );
}

function SystemTab({ dbSettings, onChange }: { readonly dbSettings: SettingsMap; readonly onChange: (k: string, v: string) => void }) {
    return (
        <div className="flex flex-col gap-6">
            <div className="border-b border-content/10 pb-2">
                <h3 className="text-lg font-semibold text-brand-accent">System Settings</h3>
                <p className="mt-1 text-xs text-content-secondary">Stored securely in the underlying database.</p>
            </div>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <label htmlFor="setting-system-log-level" className="text-xs font-medium text-content-secondary">Log Level</label>
                    <Select id="setting-system-log-level" value={dbSettings.system_log_level || 'info'} onChange={(e) => onChange('system_log_level', e.target.value)}>
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                    </Select>
                </div>
                <div className="flex flex-col gap-1">
                    <label htmlFor="setting-system-max-threads" className="text-xs font-medium text-content-secondary">Maximum Worker Threads (Example)</label>
                    <Input id="setting-system-max-threads" type="number" value={dbSettings.system_max_threads || '4'} onChange={(e) => onChange('system_max_threads', e.target.value)} />
                </div>
            </div>
        </div>
    );
}

function UiTab({
    theme,
    setTheme,
    animationsEnabled,
    setAnimationsEnabled,
    aiMode,
    setAiMode,
}: Pick<SettingsModalProps, 'theme' | 'setTheme' | 'animationsEnabled' | 'setAnimationsEnabled' | 'aiMode' | 'setAiMode'>) {
    return (
        <div className="flex flex-col gap-6">
            <div className="border-b border-content/10 pb-2">
                <h3 className="text-lg font-semibold text-brand-accent">UI Settings</h3>
                <p className="mt-1 text-xs text-content-secondary">Persisted locally in the browser/client storage.</p>
            </div>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <label htmlFor="setting-ai-mode" className="text-xs font-medium text-content-secondary">AI Mode</label>
                    <Select
                        id="setting-ai-mode"
                        aria-label="AI Mode"
                        value={aiMode}
                        onChange={(event) => setAiMode(event.target.value as AiMode)}
                    >
                        <option value="live">Live</option>
                        <option value="mock">Mock</option>
                        <option value="off">Off</option>
                    </Select>
                    <p className="text-xs text-content-secondary">Folder ingest and AI metadata actions will use this mode.</p>
                </div>
                <div className="flex flex-col gap-1">
                    <label htmlFor="setting-color-theme" className="text-xs font-medium text-content-secondary">Color Theme</label>
                    <Select id="setting-color-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
                        <option value="dark">Dark Theme (Default)</option>
                        <option value="light">Light Theme (Preview)</option>
                    </Select>
                </div>
                <div className="flex items-center gap-3">
                    <Checkbox id="ui_anim" checked={animationsEnabled} onChange={(e) => setAnimationsEnabled(e.target.checked)} />
                    <label htmlFor="ui_anim" className="text-sm font-medium text-content-secondary select-none cursor-pointer">Enable smooth UI animations</label>
                </div>
            </div>
        </div>
    );
}

function WorkflowsTab({ dbSettings, onChange }: { readonly dbSettings: SettingsMap; readonly onChange: (k: string, v: string) => void }) {
    return (
        <div className="flex flex-col gap-6">
            <div className="border-b border-content/10 pb-2">
                <h3 className="text-lg font-semibold text-brand-accent">Workflows</h3>
                <p className="mt-1 text-xs text-content-secondary">Runtime workflow settings.</p>
            </div>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <label htmlFor="setting-workflow-auto-scan" className="text-xs font-medium text-content-secondary">Auto-Scan Strategy</label>
                    <Select id="setting-workflow-auto-scan" value={dbSettings.workflow_auto_scan || 'manual'} onChange={(e) => onChange('workflow_auto_scan', e.target.value)}>
                        <option value="manual">Manual Only</option>
                        <option value="startup">Scan watched folders on Startup</option>
                    </Select>
                </div>
                <Card className="text-xs text-content-secondary">
                    Library processing now runs entirely through workflow-runtime definitions. Legacy module toggles and stage override JSON settings have been removed.
                </Card>
            </div>
        </div>
    );
}

function AiJobSection({ dbSettings, onChange }: { readonly dbSettings: SettingsMap; readonly onChange: (k: string, v: string) => void }) {
    return (
        <Card className="gap-4">
            <div className="flex flex-col gap-1">
                <label htmlFor="setting-ai-metadata-v2-api-key" className="text-xs font-medium uppercase tracking-wider text-content-secondary">AI Metadata V2 API Key</label>
                <Input id="setting-ai-metadata-v2-api-key" type="password" autoComplete="current-password" value={dbSettings.ai_metadata_v2_api_key || ''} onChange={(e) => onChange('ai_metadata_v2_api_key', e.target.value)} placeholder="AIzaSy..." />
                <p className="text-xs text-content-secondary">Preferred by the runtime AI metadata module. Falls back to the Gemini key, then <code className="rounded bg-black/30 px-1 py-0.5 font-mono">GEMINI_API_KEY</code> from <code className="rounded bg-black/30 px-1 py-0.5 font-mono">.env.local</code>, if left blank.</p>
            </div>
            <div className="flex flex-col gap-1">
                <label htmlFor="setting-gemini-api-key" className="text-xs font-medium uppercase tracking-wider text-content-secondary">Gemini API Key</label>
                <Input id="setting-gemini-api-key" type="password" autoComplete="current-password" value={dbSettings.gemini_api_key || ''} onChange={(e) => onChange('gemini_api_key', e.target.value)} placeholder="AIzaSy..." />
                <p className="text-xs text-content-secondary">Optional fallback key for Gemini-backed runtime metadata execution before the <code className="rounded bg-black/30 px-1 py-0.5 font-mono">.env.local</code> fallback. Get a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-brand-accent hover:underline">aistudio.google.com/apikey</a></p>
            </div>
            <div className="flex flex-col gap-1">
                <label htmlFor="setting-gemini-csv-path" className="text-xs font-medium uppercase tracking-wider text-content-secondary">Kinship Explorer CSV Path</label>
                <Input id="setting-gemini-csv-path" type="text" value={dbSettings.gemini_csv_path || ''} onChange={(e) => onChange('gemini_csv_path', e.target.value)} placeholder="C:/Path/To/Names.csv" />
                <p className="text-xs text-content-secondary">Used to identify people across generations</p>
            </div>
            <div className="flex flex-col gap-1">
                <label htmlFor="setting-job-ai-model-scout" className="text-xs font-medium uppercase tracking-wider text-content-secondary">Scout Model</label>
                <Input id="setting-job-ai-model-scout" type="text" value={dbSettings.job_ai_model_scout || 'gemini-2.5-flash'} onChange={(e) => onChange('job_ai_model_scout', e.target.value)} placeholder="gemini-2.5-flash" />
                <p className="text-xs text-content-secondary">Cheap first-pass ingest model. Default is <code className="rounded bg-black/30 px-1 py-0.5 font-mono">gemini-2.5-flash</code>.</p>
            </div>
            <div className="flex flex-col gap-1">
                <label htmlFor="setting-job-ai-model-refine" className="text-xs font-medium uppercase tracking-wider text-content-secondary">Refine Model</label>
                <Input id="setting-job-ai-model-refine" type="text" value={dbSettings.job_ai_model_refine || 'gemini-3.1-pro-preview'} onChange={(e) => onChange('job_ai_model_refine', e.target.value)} placeholder="gemini-3.1-pro-preview" />
                <p className="text-xs text-content-secondary">Optional higher-quality second-pass model for refine treatment. Default is <code className="rounded bg-black/30 px-1 py-0.5 font-mono">gemini-3.1-pro-preview</code>.</p>
            </div>
        </Card>
    );
}

function ClusterJobSection({ dbSettings, onChange }: { readonly dbSettings: SettingsMap; readonly onChange: (k: string, v: string) => void }) {
    const faceMatchingMode = (dbSettings.job_face_matching_mode || 'balanced') as FaceMatchingMode;

    return (
        <Card className="gap-4">
            <div className="flex flex-col gap-1">
                <label htmlFor="setting-job-face-matching-mode" className="text-xs font-medium uppercase tracking-wider text-content-secondary">Face Matching Mode</label>
                <Select
                    id="setting-job-face-matching-mode"
                    value={faceMatchingMode}
                    onChange={(e) => onChange('job_face_matching_mode', e.target.value)}
                >
                    {FACE_MATCHING_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </Select>
                <p className="text-xs text-content-secondary">
                    {FACE_MATCHING_MODE_OPTIONS.find((option) => option.value === faceMatchingMode)?.description || 'Default blend of precision and recall.'}
                </p>
            </div>
            <div className="flex flex-col gap-1">
                <label htmlFor="setting-job-cluster-threshold" className="text-xs font-medium uppercase tracking-wider text-content-secondary">Cluster Distance Threshold</label>
                <Input id="setting-job-cluster-threshold" type="number" step="0.01" value={dbSettings.job_cluster_threshold || '0.55'} onChange={(e) => onChange('job_cluster_threshold', e.target.value)} />
                <p className="text-xs text-content-secondary">Lower values mean stricter clustering. Default is usually ~0.55.</p>
            </div>
        </Card>
    );
}

function JobsTab({ dbSettings, onChange }: { readonly dbSettings: SettingsMap; readonly onChange: (k: string, v: string) => void }) {
    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
                <h3 className="border-b border-content/10 pb-2 text-lg font-semibold text-brand-accent">Workflow: library_ai_metadata_v1</h3>
                <AiJobSection dbSettings={dbSettings} onChange={onChange} />
            </div>
            <div className="flex flex-col gap-4">
                <h3 className="border-b border-content/10 pb-2 text-lg font-semibold text-brand-accent">Workflow: library_grouping_v1</h3>
                <ClusterJobSection dbSettings={dbSettings} onChange={onChange} />
            </div>
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

        let cancelled = false;

        void loadDbSettings(getSetting).then((nextSettings) => {
            if (cancelled) {
                return;
            }

            setDbSettings(nextSettings);
            setSaveStatus(null);
        });

        return () => {
            cancelled = true;
        };
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
            setSaveStatus('Saved ✓');
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
    readonly activeTab: Tab;
    readonly onChange: (tab: Tab) => void;
}) {
    return (
        <div className="flex w-64 flex-col border-r border-content/10 bg-surface-secondary py-4">
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
    aiMode,
    setAiMode,
}: {
    readonly activeTab: Tab;
    readonly dbSettings: SettingsMap;
    readonly onDbChange: (k: string, v: string) => void;
    readonly theme: string;
    readonly setTheme: (v: string) => void;
    readonly animationsEnabled: boolean;
    readonly setAnimationsEnabled: (v: boolean) => void;
    readonly aiMode: AiMode;
    readonly setAiMode: (mode: AiMode) => void;
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
                aiMode={aiMode}
                setAiMode={setAiMode}
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
    readonly activeTab: Tab;
    readonly saveStatus: string | null;
    readonly onSave: () => void;
}) {
    if (activeTab === 'ui') {
        return null;
    }

    return (
        <div className="flex items-center justify-end border-t border-content/10 bg-surface-secondary px-6 py-4">
            {saveStatus && <span className={`mr-4 text-sm ${saveStatus.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>{saveStatus}</span>}
            <Button onClick={onSave}>Save DB Settings</Button>
        </div>
    );
}

export function SettingsModal({
    isOpen, onClose, getSetting, setSetting,
    theme, setTheme, animationsEnabled, setAnimationsEnabled, aiMode, setAiMode,
}: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<Tab>('system');
    const [dbSettings, setDbSettings] = useState<SettingsMap>({});
    const [saveStatus, setSaveStatus] = useState<string | null>(null);

    useDbSettingsLoader(isOpen, getSetting, setDbSettings, setSaveStatus);

    const handleDbChange = (key: string, value: string) => setDbSettings((prev) => ({ ...prev, [key]: value }));
    const handleSaveDbSettings = useDbSettingsSaver(dbSettings, setSetting, setSaveStatus);

    if (!isOpen) {return null;}

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div
                className="flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-content/10 bg-surface text-content shadow-2xl"
                style={{ height: '720px', maxHeight: '90vh' }}
            >
                <div className="flex items-center justify-between border-b border-content/10 bg-surface-secondary px-6 py-4">
                    <div className="flex items-center gap-3"><span className="text-xl">⚙️</span><h2 className="text-xl font-bold">Settings</h2></div>
                    <button onClick={onClose} className="text-content-secondary hover:text-content transition-colors" aria-label="Close Settings">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 overflow-hidden">
                    <SettingsSidebar activeTab={activeTab} onChange={setActiveTab} />

                    <div className="min-h-0 flex-1 overflow-y-auto bg-surface p-6">
                        <SettingsContent
                            activeTab={activeTab}
                            dbSettings={dbSettings}
                            onDbChange={handleDbChange}
                            theme={theme}
                            setTheme={setTheme}
                            animationsEnabled={animationsEnabled}
                            setAnimationsEnabled={setAnimationsEnabled}
                            aiMode={aiMode}
                            setAiMode={setAiMode}
                        />
                    </div>
                </div>

                <SettingsFooter activeTab={activeTab} saveStatus={saveStatus} onSave={handleSaveDbSettings} />
            </div>
        </div>
    );
}
