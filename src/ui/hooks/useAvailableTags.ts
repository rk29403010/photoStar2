import { useEffect, useState } from 'react';
import type { TagDefinitionSummary } from '@contracts/core';

export function useAvailableTags(
    enabled: boolean,
    loadAvailableTags: () => Promise<TagDefinitionSummary[]>,
) {
    const [availableTags, setAvailableTags] = useState<TagDefinitionSummary[]>([]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        let cancelled = false;
        void loadAvailableTags()
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
    }, [enabled, loadAvailableTags]);

    return availableTags;
}
