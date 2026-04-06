import type { TagAliasSummary, TagDefinitionSummary } from '@contracts/core';

export type TagDetail = {
    tag: TagDefinitionSummary;
    aliases: TagAliasSummary[];
};

export type BusyAction = 'rename' | 'alias' | 'merge' | null;
