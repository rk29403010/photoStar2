import { useEffect, useState } from 'react';
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
    readonly testProviderKeyCommand: (provider: string, key: string) => Promise<{ valid: boolean; error?: string }>;
    readonly saveProviderKey: (provider: string, key: string) => Promise<{ success: boolean; error?: string }>;
    readonly deleteProviderKey: (provider: string) => Promise<{ success: boolean; error?: string }>;
    readonly getRedactedProviderKey: (provider: string) => Promise<{ redactedKey: string | null; error?: string }>;
};

type Tab = 'system' | 'local' | 'secrets';
type SettingsMap = { [key: string]: string };

const dbKeys = ['system_log_level'] as const;

const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'system', label: 'System' },
    { id: 'local', label: 'Local' },
    { id: 'secrets', label: 'Secret Keys' },
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

function SystemTab({ dbSettings, onChange }: { readonly dbSettings: SettingsMap; readonly onChange: (key: string, value: string) => void }) {
    return (
        <div className="flex flex-col gap-6">
            <div className="border-b border-content/10 pb-2">
                <h3 className="text-lg font-semibold text-brand-accent">System</h3>
                <p className="mt-1 text-xs text-content-secondary">Stored securely in the database.</p>
            </div>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <label htmlFor="setting-system-log-level" className="text-xs font-medium text-content-secondary">Log Level</label>
                    <Select id="setting-system-log-level" value={dbSettings.system_log_level || 'info'} onChange={(event) => onChange('system_log_level', event.target.value)}>
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                    </Select>
                </div>
            </div>
        </div>
    );
}

function LocalTab({
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
                <h3 className="text-lg font-semibold text-brand-accent">Local</h3>
                <p className="mt-1 text-xs text-content-secondary">Saved locally - only applies to your device.</p>
            </div>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <label htmlFor="setting-ai-mode" className="text-xs font-medium text-content-secondary">AI</label>
                    <Select
                        id="setting-ai-mode"
                        aria-label="AI Mode"
                        value={aiMode}
                        onChange={(event) => setAiMode(event.target.value as AiMode)}
                    >
                        <option value="live">On</option>
                        <option value="off">Off</option>
                    </Select>
                    <p className="text-xs text-content-secondary">Controls whether PhotoStar may make AI API calls from this device.</p>
                </div>
                <div className="flex flex-col gap-1">
                    <label htmlFor="setting-color-theme" className="text-xs font-medium text-content-secondary">Colour Theme</label>
                    <Select id="setting-color-theme" value={theme} onChange={(event) => setTheme(event.target.value)}>
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                    </Select>
                </div>
                <div className="flex items-center gap-3">
                    <Checkbox id="ui_anim" checked={animationsEnabled} onChange={(event) => setAnimationsEnabled(event.target.checked)} />
                    <label htmlFor="ui_anim" className="text-sm font-medium text-content-secondary select-none cursor-pointer">Enable smooth UI animations</label>
                </div>
            </div>
        </div>
    );
}

type ApiProviderSettingsProps = {
    readonly testProviderKeyCommand: SettingsModalProps['testProviderKeyCommand'];
    readonly saveProviderKey: SettingsModalProps['saveProviderKey'];
    readonly deleteProviderKey: SettingsModalProps['deleteProviderKey'];
    readonly getRedactedProviderKey: SettingsModalProps['getRedactedProviderKey'];
};

const API_PROVIDERS = [
    {
        id: 'gemini',
        name: 'Google Gemini AI',
        description: 'Used for live image analysis, tag suggestions, and caption refinement.',
    },
];

function useProviderKeyState(getRedactedProviderKey: ApiProviderSettingsProps['getRedactedProviderKey']) {
    const [providerKeys, setProviderKeys] = useState<Record<string, string | null>>({});
    const [inputs, setInputs] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [errors, setErrors] = useState<Record<string, string | null>>({});
    const [successMsg, setSuccessMsg] = useState<Record<string, string | null>>({});
    useEffect(() => {
        let active = true;
        async function loadKeys() {
            const nextKeys: Record<string, string | null> = {};
            for (const provider of API_PROVIDERS) {
                try {
                    const result = await getRedactedProviderKey(provider.id);
                    if (active) {
                        nextKeys[provider.id] = result.redactedKey;
                    }
                } catch {
                    if (active) {
                        nextKeys[provider.id] = null;
                    }
                }
            }
            if (active) {
                setProviderKeys(nextKeys);
            }
        }
        void loadKeys();
        return () => {
            active = false;
        };
    }, [getRedactedProviderKey]);
    return {
        errors, inputs, loading, providerKeys, setErrors, setInputs,
        setLoading, setProviderKeys, setSuccessMsg, successMsg,
    };
}

async function validateAndStoreProviderKey(
    props: ApiProviderSettingsProps,
    provider: string,
    key: string,
): Promise<string | null> {
    const testResult = await props.testProviderKeyCommand(provider, key);
    if (!testResult.valid) {
        throw new Error(testResult.error || 'Key validation failed');
    }
    const saveResult = await props.saveProviderKey(provider, key);
    if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save key to secure vault');
    }
    return (await props.getRedactedProviderKey(provider)).redactedKey;
}

function useProviderKeyActions(
    props: ApiProviderSettingsProps,
    state: ReturnType<typeof useProviderKeyState>,
) {
    const start = (provider: string) => {
        state.setLoading((current) => ({ ...current, [provider]: true }));
        state.setErrors((current) => ({ ...current, [provider]: null }));
        state.setSuccessMsg((current) => ({ ...current, [provider]: null }));
    };
    const stop = (provider: string) =>
        state.setLoading((current) => ({ ...current, [provider]: false }));
    const fail = (provider: string, error: unknown) =>
        state.setErrors((current) => ({
            ...current,
            [provider]: error instanceof Error ? error.message : String(error),
        }));

    const handleTestAndSave = async (provider: string) => {
        const proposedKey = (state.inputs[provider] || '').trim();
        if (!proposedKey) {
            fail(provider, 'Please enter a valid key');
            return;
        }
        start(provider);
        try {
            const redactedKey = await validateAndStoreProviderKey(props, provider, proposedKey);
            state.setProviderKeys((current) => ({ ...current, [provider]: redactedKey }));
            state.setInputs((current) => ({ ...current, [provider]: '' }));
            state.setSuccessMsg((current) => ({ ...current, [provider]: 'Key verified & securely stored! ✓' }));
        } catch (error) {
            fail(provider, error);
        } finally {
            stop(provider);
        }
    };
    const handleDelete = async (provider: string) => {
        start(provider);
        try {
            const result = await props.deleteProviderKey(provider);
            if (!result.success) {
                throw new Error(result.error || 'Failed to delete key');
            }
            state.setProviderKeys((current) => ({ ...current, [provider]: null }));
            state.setSuccessMsg((current) => ({ ...current, [provider]: 'Key removed securely ✓' }));
        } catch (error) {
            fail(provider, error);
        } finally {
            stop(provider);
        }
    };
    return { handleDelete, handleTestAndSave };
}

function ProviderKeyCard(props: {
    readonly provider: (typeof API_PROVIDERS)[number];
    readonly state: ReturnType<typeof useProviderKeyState>;
    readonly actions: ReturnType<typeof useProviderKeyActions>;
}) {
    const id = props.provider.id;
    const savedKey = props.state.providerKeys[id];
    const hasKey = savedKey !== null && savedKey !== undefined;
    const isLoading = props.state.loading[id];
    return (
        <Card className="flex flex-col gap-4 p-5 bg-surface-secondary border border-content/5 rounded-lg">
            <div className="flex flex-col gap-1">
                <h4 className="font-semibold text-content">{props.provider.name}</h4>
                <p className="text-xs text-content-secondary">{props.provider.description}</p>
            </div>
            {hasKey ? (
                <div className="flex items-center justify-between bg-surface p-3 rounded-md border border-content/10">
                    <div className="flex items-center gap-2">
                        <span className="text-emerald-500">🔒</span>
                        <span className="font-mono text-sm tracking-wider text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded">{savedKey}</span>
                        <span className="text-xs text-content-secondary">(Securely configured)</span>
                    </div>
                    <Button onClick={() => props.actions.handleDelete(id)} disabled={isLoading}>Delete Key</Button>
                </div>
            ) : (
                <div className="flex gap-2">
                    <Input
                        type="password"
                        autoComplete="current-password"
                        value={props.state.inputs[id] || ''}
                        onChange={(event) => props.state.setInputs((current) => ({ ...current, [id]: event.target.value }))}
                        placeholder="Enter API key"
                        disabled={isLoading}
                    />
                    <Button onClick={() => props.actions.handleTestAndSave(id)} disabled={isLoading}>
                        {isLoading ? 'Testing...' : 'Test & Save'}
                    </Button>
                </div>
            )}
            {props.state.errors[id] && <div className="text-xs text-red-400">⚠️ {props.state.errors[id]}</div>}
            {props.state.successMsg[id] && <div className="text-xs text-emerald-400">{props.state.successMsg[id]}</div>}
        </Card>
    );
}

function SecretKeysTab(props: ApiProviderSettingsProps) {
    const state = useProviderKeyState(props.getRedactedProviderKey);
    const actions = useProviderKeyActions(props, state);

    return (
        <div className="flex flex-col gap-6">
            <div className="border-b border-content/10 pb-2">
                <h3 className="text-lg font-semibold text-brand-accent">Secret Keys</h3>
                <p className="mt-1 text-xs text-content-secondary">
                    API keys are verified before being stored in your operating system&apos;s credential vault.
                </p>
            </div>
            <div className="flex flex-col gap-6">
                {API_PROVIDERS.map((provider) => (
                    <ProviderKeyCard key={provider.id} provider={provider} state={state} actions={actions} />
                ))}
            </div>
        </div>
    );
}

function loadDbSettings(getSetting: SettingsModalProps['getSetting']): Promise<SettingsMap> {
    return Promise.all(
        dbKeys.map((key) => getSetting(key).then((value) => ({ key, value })).catch(() => ({ key, value: '' })))
    ).then((results) => {
        const next: SettingsMap = {};
        results.forEach((result) => {
            next[result.key] = result.value;
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
    testProviderKeyCommand,
    saveProviderKey,
    deleteProviderKey,
    getRedactedProviderKey,
}: {
    readonly activeTab: Tab;
    readonly dbSettings: SettingsMap;
    readonly onDbChange: (key: string, value: string) => void;
    readonly theme: string;
    readonly setTheme: (v: string) => void;
    readonly animationsEnabled: boolean;
    readonly setAnimationsEnabled: (v: boolean) => void;
    readonly aiMode: AiMode;
    readonly setAiMode: (mode: AiMode) => void;
    readonly testProviderKeyCommand: SettingsModalProps['testProviderKeyCommand'];
    readonly saveProviderKey: SettingsModalProps['saveProviderKey'];
    readonly deleteProviderKey: SettingsModalProps['deleteProviderKey'];
    readonly getRedactedProviderKey: SettingsModalProps['getRedactedProviderKey'];
}) {
    if (activeTab === 'system') {
        return <SystemTab dbSettings={dbSettings} onChange={onDbChange} />;
    }

    if (activeTab === 'local') {
        return (
            <LocalTab
                theme={theme}
                setTheme={setTheme}
                animationsEnabled={animationsEnabled}
                setAnimationsEnabled={setAnimationsEnabled}
                aiMode={aiMode}
                setAiMode={setAiMode}
            />
        );
    }

    return (
        <SecretKeysTab
            testProviderKeyCommand={testProviderKeyCommand}
            saveProviderKey={saveProviderKey}
            deleteProviderKey={deleteProviderKey}
            getRedactedProviderKey={getRedactedProviderKey}
        />
    );
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
    if (activeTab !== 'system') {
        return null;
    }

    return (
        <div className="flex items-center justify-end border-t border-content/10 bg-surface-secondary px-6 py-4">
            {saveStatus && <span className={`mr-4 text-sm ${saveStatus.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>{saveStatus}</span>}
            <Button onClick={onSave}>Save</Button>
        </div>
    );
}

export function SettingsModal({
    isOpen, onClose, getSetting, setSetting,
    theme, setTheme, animationsEnabled, setAnimationsEnabled, aiMode, setAiMode,
    testProviderKeyCommand, saveProviderKey, deleteProviderKey, getRedactedProviderKey,
}: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<Tab>('system');
    const [dbSettings, setDbSettings] = useState<SettingsMap>({});
    const [saveStatus, setSaveStatus] = useState<string | null>(null);

    useDbSettingsLoader(isOpen, getSetting, setDbSettings, setSaveStatus);

    const handleDbChange = (key: string, value: string) => setDbSettings((previous) => ({ ...previous, [key]: value }));
    const handleSaveDbSettings = useDbSettingsSaver(dbSettings, setSetting, setSaveStatus);

    if (!isOpen) {return null;}

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="flex h-5/6 w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-content/10 bg-surface text-content shadow-2xl">
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
                            testProviderKeyCommand={testProviderKeyCommand}
                            saveProviderKey={saveProviderKey}
                            deleteProviderKey={deleteProviderKey}
                            getRedactedProviderKey={getRedactedProviderKey}
                        />
                    </div>
                </div>

                <SettingsFooter activeTab={activeTab} saveStatus={saveStatus} onSave={handleSaveDbSettings} />
            </div>
        </div>
    );
}
