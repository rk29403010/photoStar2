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

// List of keys we care about from the DB
const dbKeys = [
    'system_log_level',
    'system_max_threads',
    'workflow_auto_scan',
    'workflow_generate_previews_on_ingest',
    'gemini_api_key',
    'gemini_csv_path',
    'job_ai_model',
    'job_cluster_threshold'
];

export function SettingsModal({
    isOpen, onClose, getSetting, setSetting,
    theme, setTheme, animationsEnabled, setAnimationsEnabled
}: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<'system' | 'ui' | 'workflows' | 'jobs'>('system');

    // DB Settings State
    const [dbSettings, setDbSettings] = useState<{ [key: string]: string }>({});
    const [saveStatus, setSaveStatus] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            // Load DB settings
            Promise.all(dbKeys.map(key => getSetting(key).then(val => ({ key, val })).catch(() => ({ key, val: '' }))))
                .then(results => {
                    const newSettings: { [key: string]: string } = {};
                    results.forEach(r => {
                        newSettings[r.key] = r.val;
                    });
                    setDbSettings(newSettings);
                    setSaveStatus(null);
                });
        }
    }, [isOpen, getSetting]);

    const handleDbChange = (key: string, value: string) => {
        setDbSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSaveDbSettings = async () => {
        setSaveStatus('Saving...');
        try {
            for (const key of dbKeys) {
                await setSetting(key, dbSettings[key] || '');
            }
            setSaveStatus('Saved \u2713');
            setTimeout(() => setSaveStatus(null), 2000);
        } catch {
            setSaveStatus('Error saving');
            setTimeout(() => setSaveStatus(null), 2000);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
            <div className="bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-gray-200">
                <div className="flex justify-between items-center bg-[#222] px-6 py-4 border-b border-[#333]">
                    <div className="flex items-center gap-3">
                        <span className="text-xl">⚙️</span>
                        <h2 className="text-xl font-bold">Settings</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close Settings">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left Navigation */}
                    <div className="w-64 bg-[#111] border-r border-[#333] flex flex-col py-4">
                        <button
                            onClick={() => setActiveTab('system')}
                            className={`px-6 py-3 text-left font-medium transition-colors ${activeTab === 'system' ? 'bg-[#2a5] text-white' : 'text-gray-400 hover:bg-[#222] hover:text-gray-200'}`}
                        >
                            System Settings
                        </button>
                        <button
                            onClick={() => setActiveTab('ui')}
                            className={`px-6 py-3 text-left font-medium transition-colors ${activeTab === 'ui' ? 'bg-[#2a5] text-white' : 'text-gray-400 hover:bg-[#222] hover:text-gray-200'}`}
                        >
                            UI Settings
                        </button>
                        <button
                            onClick={() => setActiveTab('workflows')}
                            className={`px-6 py-3 text-left font-medium transition-colors ${activeTab === 'workflows' ? 'bg-[#2a5] text-white' : 'text-gray-400 hover:bg-[#222] hover:text-gray-200'}`}
                        >
                            Workflows
                        </button>
                        <button
                            onClick={() => setActiveTab('jobs')}
                            className={`px-6 py-3 text-left font-medium transition-colors ${activeTab === 'jobs' ? 'bg-[#2a5] text-white' : 'text-gray-400 hover:bg-[#222] hover:text-gray-200'}`}
                        >
                            Registered Jobs
                        </button>
                    </div>

                    {/* Right Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 bg-[#1a1a1a]">

                        {activeTab === 'system' && (
                            <div className="space-y-6">
                                <h3 className="text-lg font-semibold border-b border-[#333] pb-2 text-blue-400">System Settings</h3>
                                <p className="text-xs text-gray-500 mb-4">Stored securely in the underlying database.</p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Log Level</label>
                                        <select
                                            value={dbSettings['system_log_level'] || 'info'}
                                            onChange={(e) => handleDbChange('system_log_level', e.target.value)}
                                            className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm outline-none focus:border-[#2a5]"
                                        >
                                            <option value="debug">Debug</option>
                                            <option value="info">Info</option>
                                            <option value="warn">Warn</option>
                                            <option value="error">Error</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Maximum Worker Threads (Example)</label>
                                        <input
                                            type="number"
                                            value={dbSettings['system_max_threads'] || '4'}
                                            onChange={(e) => handleDbChange('system_max_threads', e.target.value)}
                                            className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm outline-none focus:border-[#2a5]"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'ui' && (
                            <div className="space-y-6">
                                <h3 className="text-lg font-semibold border-b border-[#333] pb-2 text-pink-400">UI Settings</h3>
                                <p className="text-xs text-gray-500 mb-4">Persisted locally in the browser/client storage.</p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Color Theme</label>
                                        <select
                                            value={theme}
                                            onChange={(e) => setTheme(e.target.value)}
                                            className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm outline-none focus:border-[#2a5]"
                                        >
                                            <option value="dark">Dark Theme (Default)</option>
                                            <option value="light">Light Theme (Preview)</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="ui_anim"
                                            checked={animationsEnabled}
                                            onChange={(e) => setAnimationsEnabled(e.target.checked)}
                                            className="w-4 h-4 bg-[#111] border-[#333] rounded text-[#2a5] focus:ring-[#2a5]"
                                        />
                                        <label htmlFor="ui_anim" className="text-sm font-medium text-gray-300">Enable smooth UI animations</label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'workflows' && (
                            <div className="space-y-6">
                                <h3 className="text-lg font-semibold border-b border-[#333] pb-2 text-orange-400">Workflows</h3>
                                <p className="text-xs text-gray-500 mb-4">Pipeline automation settings.</p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Auto-Scan Strategy</label>
                                        <select
                                            value={dbSettings['workflow_auto_scan'] || 'manual'}
                                            onChange={(e) => handleDbChange('workflow_auto_scan', e.target.value)}
                                            className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm outline-none focus:border-[#2a5]"
                                        >
                                            <option value="manual">Manual Only</option>
                                            <option value="startup">Scan watched folders on Startup</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Preview Generation</label>
                                        <select
                                            value={dbSettings['workflow_generate_previews_on_ingest'] || 'true'}
                                            onChange={(e) => handleDbChange('workflow_generate_previews_on_ingest', e.target.value)}
                                            className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm outline-none focus:border-[#2a5]"
                                        >
                                            <option value="true">Generate previews immediately during ingest</option>
                                            <option value="false">Wait for explicit command</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'jobs' && (
                            <div className="space-y-8">
                                <div>
                                    <h3 className="text-lg font-semibold border-b border-[#333] pb-2 text-purple-400 mb-4">Job: get_metadata_ai</h3>

                                    <div className="space-y-4 bg-[#242424] p-4 rounded-lg border border-[#333]">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">Gemini API Key</label>
                                            <input
                                                id="setting-gemini-api-key"
                                                type="password"
                                                value={dbSettings['gemini_api_key'] || ''}
                                                onChange={(e) => handleDbChange('gemini_api_key', e.target.value)}
                                                placeholder="AIzaSy..."
                                                className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm outline-none focus:border-purple-500"
                                            />
                                            <p className="text-[10px] text-gray-500 mt-1">
                                                Get a free key at{' '}
                                                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">aistudio.google.com/apikey</a>
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">Gemini Model</label>
                                            <select
                                                value={dbSettings['job_ai_model'] || 'gemini-2.0-flash'}
                                                onChange={(e) => handleDbChange('job_ai_model', e.target.value)}
                                                className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm outline-none focus:border-purple-500"
                                            >
                                                <option value="gemini-2.0-flash">gemini-2.0-flash — Fast, Previous Gen (Recommended)</option>
                                                <option value="gemini-2.5-flash">gemini-2.5-flash — Stable Legacy, High Quality</option>
                                                <option value="gemini-3-flash-preview">gemini-3-flash-preview — Fast, Latest Series (Preview)</option>
                                                <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview — Best Quality, Slowest (Preview)</option>
                                            </select>
                                            <p className="text-[10px] text-gray-500 mt-1">Preview models may be rate-limited. Start with gemini-2.0-flash.</p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">Kinship Explorer CSV Path</label>
                                            <input
                                                type="text"
                                                value={dbSettings['gemini_csv_path'] || ''}
                                                onChange={(e) => handleDbChange('gemini_csv_path', e.target.value)}
                                                placeholder="C:/Path/To/Names.csv"
                                                className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm outline-none focus:border-purple-500"
                                            />
                                            <p className="text-[10px] text-gray-500 mt-1">Used to identify people across generations</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-semibold border-b border-[#333] pb-2 text-purple-400 mb-4">Job: cluster_faces</h3>
                                    <div className="space-y-4 bg-[#242424] p-4 rounded-lg border border-[#333]">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">Cluster Distance Threshold</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={dbSettings['job_cluster_threshold'] || '0.55'}
                                                onChange={(e) => handleDbChange('job_cluster_threshold', e.target.value)}
                                                className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm outline-none focus:border-purple-500"
                                            />
                                            <p className="text-[10px] text-gray-500 mt-1">Lower values mean stricter clustering. Default is usually ~0.55.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* Footer Save Area for DB Settings */}
                {activeTab !== 'ui' && (
                    <div className="flex justify-end items-center bg-[#222] px-6 py-4 border-t border-[#333]">
                        {saveStatus && (
                            <span className={`text-sm mr-4 ${saveStatus.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
                                {saveStatus}
                            </span>
                        )}
                        <button
                            onClick={handleSaveDbSettings}
                            className="px-6 py-2 bg-[#2a5] hover:bg-[#228b22] text-white rounded font-medium transition-colors shadow-sm"
                        >
                            Save DB Settings
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
