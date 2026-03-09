import type React from 'react';

interface AnalysisErrorDialogProps {
    analysisError: string;
    setAnalysisError: (err: string | null) => void;
    onOpenSettings?: () => void;
}

function isApiKeyError(err: string): boolean {
    return err === 'MISSING_API_KEY' || err === 'INVALID_API_KEY_FORMAT';
}

const outlineBtn: React.CSSProperties = {
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid #334155',
    padding: '5px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12
};

export const AnalysisErrorDialog: React.FC<AnalysisErrorDialogProps> = ({ analysisError, setAnalysisError, onOpenSettings }) => {
    const showApiHelp = isApiKeyError(analysisError);

    return (
        <div
            style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#0f172a', border: '1px solid #ef4444', borderRadius: '10px', padding: '22px', zIndex: 3000, color: 'white', width: 'min(480px, calc(100vw - 48px))', maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}
            onClick={(e) => e.stopPropagation()}
        >
            <h3 style={{ marginTop: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, fontSize: 16 }}>⚠️ Analysis Error</h3>
            <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#ccc', overflowY: 'auto', userSelect: 'text', flex: 1, minHeight: 0 }}>
                {showApiHelp ? (
                    <div>
                        {analysisError === 'MISSING_API_KEY'
                            ? <p style={{ marginTop: 0 }}>No Gemini API key is configured. A key is required to run AI analysis.</p>
                            : <p style={{ marginTop: 0 }}>The configured API key appears invalid and should start with <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 3 }}>AIza</code>.</p>
                        }
                        <ol style={{ paddingLeft: 18, marginBottom: 0 }}>
                            <li style={{ marginBottom: 8 }}>
                                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>Get your free Gemini API key</a> from Google AI Studio.
                            </li>
                            <li>Paste your key into <strong>Settings → Get Metadata AI Job</strong>.</li>
                        </ol>
                    </div>
                ) : (
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: '"Cascadia Code","Consolas",monospace', fontSize: 11, color: '#fca5a5', background: 'rgba(239,68,68,0.06)', padding: 10, borderRadius: 6, border: '1px solid rgba(239,68,68,0.15)' }}>{analysisError}</pre>
                )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexShrink: 0 }}>
                <button
                    onClick={async (e) => {
                        e.stopPropagation();
                        try {
                            await navigator.clipboard.writeText(analysisError);
                        } catch {
                            // ignore clipboard failures
                        }
                    }}
                    style={outlineBtn}
                >
                    📋 Copy
                </button>
                <button onClick={(e) => { e.stopPropagation(); setAnalysisError(null); }} style={outlineBtn}>Close</button>
                {showApiHelp && onOpenSettings && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setAnalysisError(null);
                            onOpenSettings();
                        }}
                        style={{ ...outlineBtn, background: '#3b82f6', borderColor: '#3b82f6', color: 'white' }}
                    >
                        ⚙️ Open Settings
                    </button>
                )}
            </div>
        </div>
    );
};
