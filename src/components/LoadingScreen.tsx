import React from 'react';

interface LoadingScreenProps {
    status: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ status }) => {
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
            <div className="loader" style={{
                width: 48,
                height: 48,
                border: '4px solid #333',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
            }} />
            <div style={{ marginTop: 20, color: '#888', fontFamily: 'monospace' }}>
                {status}
            </div>
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
