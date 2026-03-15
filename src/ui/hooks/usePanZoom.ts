import { useState, useRef, useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import { clampZoomScale } from '../components/single-photo/zoomMath';

export function usePanZoom(containerRef: RefObject<HTMLElement | null>, onReset?: () => void) {
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });

    const resetPanZoom = useCallback(() => {
        setScale(1);
        setPan({ x: 0, y: 0 });
        if (onReset) {onReset();}
    }, [onReset]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (scale > 1) {
            setIsDragging(true);
            dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }
    }, [scale, pan]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging && scale > 1) {
            setPan({
                x: e.clientX - dragStartRef.current.x,
                y: e.clientY - dragStartRef.current.y
            });
        }
    }, [isDragging, scale]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault(); // Need to prevent default to stop page scroll when zooming
            const zoomSensitivity = 0.05;
            const newScale = scale - e.deltaY * zoomSensitivity;
            const finalScale = clampZoomScale(newScale);
            setScale(finalScale);

            // Reset pan once the image is back at or below the natural size.
            if (finalScale <= 1) {
                setPan({ x: 0, y: 0 });
            }
        };

        const container = containerRef.current;
        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
        }
        return () => {
            if (container) {
                container.removeEventListener('wheel', handleWheel);
            }
        };
    }, [scale, containerRef]);

    return {
        scale,
        pan,
        isDragging,
        handleMouseDown,
        resetPanZoom,
        setScale,
        setPan
    };
}
