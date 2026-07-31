import type React from 'react';

type LoadingScreenProps = {
    readonly status: string;
}

function LoadingIndicator({ failed }: { readonly failed: boolean }) {
    if (failed) {
        return <div className="text-red-400 text-3xl font-bold">!</div>;
    }

    return (
        <div className="w-12 h-12 border-4 border-slate-700 border-t-white rounded-full animate-spin" />
    );
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ status }) => {
    const failed = status.startsWith('Backend service failed to start.');

    return (
        <div data-testid="app-loading" className="fixed inset-0 bg-slate-950 text-content flex flex-col items-center justify-center z-[9999]">
            <h1 className="mb-5 text-3xl font-bold text-white">PhotoStar</h1>
            <LoadingIndicator failed={failed} />
            <div className={`mt-5 font-mono text-center max-w-[560px] px-6 ${failed ? 'text-red-300' : 'text-content-secondary'}`}>
                {status}
            </div>
            {failed && <div className="mt-3 text-content-secondary text-sm">Check the core terminal output, then refresh once the service starts cleanly.</div>}
        </div>
    );
};
