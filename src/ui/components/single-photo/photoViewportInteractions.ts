import { useCallback, useEffect } from 'react';

type ChangeIndexHandler = (delta: -1 | 1) => void;

export function useKeyboardNavigation(params: {
    assetsLength: number;
    onClose: () => void;
    resetPanZoom: () => void;
    showInfoPanel: boolean;
    setShowInfoPanel: (value: boolean) => void;
    onChangeIndex: ChangeIndexHandler;
}) {
    const { assetsLength, onClose, resetPanZoom, showInfoPanel, setShowInfoPanel, onChangeIndex } = params;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }
            if (event.key === 'ArrowRight') {
                onChangeIndex(1);
                resetPanZoom();
                return;
            }
            if (event.key === 'ArrowLeft') {
                onChangeIndex(-1);
                resetPanZoom();
                return;
            }
            if (event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                resetPanZoom();
                return;
            }
            if (event.key === 'i' || event.key === 'I') {
                setShowInfoPanel(!showInfoPanel);
            }
        };

        if (assetsLength > 0) {
            globalThis.addEventListener('keydown', handleKeyDown);
        }

        return () => globalThis.removeEventListener('keydown', handleKeyDown);
    }, [assetsLength, onClose, onChangeIndex, resetPanZoom, setShowInfoPanel, showInfoPanel]);
}

export function useViewportGroupActions(
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>,
    onExplodeGroup?: (groupId: string) => Promise<void>
) {
    const handleSetCanonical = useCallback(async (groupId: string, newCanonicalId: string) => {
        try {
            if (onSetCanonical) {
                await onSetCanonical(groupId, newCanonicalId);
            }
        } catch (error) {
            console.error('Failed to set canonical:', error);
        }
    }, [onSetCanonical]);

    const handleExplodeGroup = useCallback(async (groupId: string) => {
        try {
            if (onExplodeGroup) {
                await onExplodeGroup(groupId);
            }
        } catch (error) {
            console.error('Failed to explode group:', error);
        }
    }, [onExplodeGroup]);

    return { handleSetCanonical, handleExplodeGroup };
}
