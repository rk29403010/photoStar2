export function MediaStatusBadge({ state }: { state: "processing" | "warning" | "error" }) {
    const map: Record<string, string> = {
        processing: "bg-blue-500",
        warning: "bg-yellow-500",
        error: "bg-red-500",
    };

    return (
        <div className={`absolute top-1 right-1 px-2 py-0.5 text-xs text-white rounded ${map[state]}`}>
            {state}
        </div>
    );
}
