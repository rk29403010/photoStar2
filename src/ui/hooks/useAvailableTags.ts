import { useEffect, useRef, useState } from 'react';
import type { TagDefinitionSummary } from '@contracts/core';

export function useAvailableTags(
    enabled: boolean,
    loadAvailableTags: () => Promise<TagDefinitionSummary[]>,
) {
    const [availableTags, setAvailableTags] = useState<TagDefinitionSummary[]>([]);
    const loadAvailableTagsRef = useRef(loadAvailableTags);

    useEffect(() => {
        loadAvailableTagsRef.current = loadAvailableTags;
    }, [loadAvailableTags]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        let cancelled = false;
        void loadAvailableTagsRef.current()
            .then((tags) => {
                if (!cancelled) {
                    setAvailableTags(tags);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAvailableTags([]);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [enabled]);

    return availableTags;
}
