export function LoadingState({ backendStatus, backendReady }: { readonly backendStatus: string; readonly backendReady: boolean }) {
    return (
        <div className="h-full flex flex-col items-center justify-center text-content-secondary gap-4">
            <div className="motion-safe:animate-pulse text-3xl">⌛</div>
            <div className="text-center">
                <div>{backendStatus.includes('Error') ? backendStatus : 'Initialising photo library...'}</div>
                {!backendReady && !backendStatus.includes('Error') && <div className="text-xs opacity-60 mt-1">Establishing connection to backend service...</div>}
            </div>
        </div>
    );
}

export function EmptyState() {
    return (
        <div className="h-full flex flex-col items-center justify-center text-content-secondary gap-4">
            <div className="text-5xl opacity-30">📂</div>
            <div className="font-medium text-content">No photos found in library.</div>
            <div className="text-sm opacity-70">Click &quot;Actions &gt; Scan Folder&quot; to import photos.</div>
        </div>
    );
}
