import { useState, useEffect, useRef, type ReactNode } from 'react';

type AutoSizerProps = {
    readonly children: (size: { height: number; width: number }) => ReactNode;
}

export default function AutoSizer({ children }: AutoSizerProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ height: 0, width: 0 });

    useEffect(() => {
        if (!ref.current) {return;}

        // Initial measure
        setSize({
            height: ref.current.offsetHeight,
            width: ref.current.offsetWidth
        });

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setSize({
                    height: entry.contentRect.height,
                    width: entry.contentRect.width,
                });
            }
        });
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
            {size.height > 0 && size.width > 0 && children(size)}
        </div>
    );
}
