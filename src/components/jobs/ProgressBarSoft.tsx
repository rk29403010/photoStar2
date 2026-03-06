

export function ProgressBarSoft({
    percent,
    indeterminate,
}: {
    percent?: number;
    indeterminate?: boolean;
}) {
    return (
        <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
            {indeterminate ? (
                <div className="h-full w-1/3 bg-blue-500 animate-pulse" />
            ) : (
                <div
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, percent ?? 0)}%` }}
                />
            )}
        </div>
    );
}
