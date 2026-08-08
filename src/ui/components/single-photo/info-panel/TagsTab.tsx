import type React from 'react';
import type { Asset, ReviewItemSummary, TagDefinitionSummary } from '@contracts/core';
import { TagManagementSection } from './TagManagementSection';

type TagsTabProps = {
  readonly asset: Asset;
  readonly availableTags?: TagDefinitionSummary[];
  readonly onAssignTag?: (tagLabel: string) => Promise<void>;
  readonly onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
  readonly onSetReviewItemStatus?: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
};

export const TagsTab: React.FC<TagsTabProps> = (props) => <TagManagementSection {...props} />;
