

export function ProgressBarSoft({
    percent,
    indeterminate,
}: {
    readonly percent?: number;
    readonly indeterminate?: boolean;
}) {
    return (
        <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
            {indeterminate ? (
                <div className="h-full w-1/3 bg-cyan-400 motion-safe:animate-pulse" />
            ) : (
                <div
                    className="h-full bg-cyan-400 motion-safe:transition-all motion-safe:duration-500"
                    style={{ width: `${Math.min(100, percent ?? 0)}%` }}
                />
            )}
        </div>
    );
}
