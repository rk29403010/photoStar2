export interface StatusBanner {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
}

export function createStatusMessageBanner(message: string): StatusBanner {
    return { message };
}
