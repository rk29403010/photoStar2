import type React from 'react';

interface LoadingScreenProps {
    status: string;
}

function LoadingIndicator({ failed }: { failed: boolean }) {
    if (failed) {
        return <div style={{ fontSize: '2rem', color: '#f87171' }}>!</div>;
    }

    return (
        <div className="loader" style={{
            width: 48,
            height: 48,
            border: '4px solid #333',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
        }} />
    );
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ status }) => {
    const failed = status.startsWith('Backend service failed to start.');

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: '#0a0a0a',
            color: '#eee',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
        }}>
            <h1 style={{ marginBottom: 20, fontSize: '2rem', fontWeight: 'bold' }}>PhotoStar</h1>
            <LoadingIndicator failed={failed} />
            <div style={{ marginTop: 20, color: failed ? '#fca5a5' : '#cbd5e1', fontFamily: 'monospace', textAlign: 'center', maxWidth: 560, padding: '0 24px' }}>
                {status}
            </div>
            {failed && <div style={{ marginTop: 12, color: '#94a3b8', fontSize: '0.9rem' }}>Check the core terminal output, then refresh once the service starts cleanly.</div>}
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
