import type { ReactNode } from 'react';
import type { Asset, PhotoEditOperation } from '@contracts/core';

export type PhotoEditToolControlProps = {
  readonly asset?: Asset;
  readonly operation: PhotoEditOperation;
  readonly sourceUrl: string | null;
  readonly onCommit: (operation: PhotoEditOperation) => void;
  readonly onPreviewChange: (operation: PhotoEditOperation) => void;
};

export type PhotoEditToolOverlayProps = {
  readonly operation: PhotoEditOperation;
  readonly previewUrl: string | null;
  readonly sourceUrl: string | null;
  readonly showWithoutChange: boolean;
  readonly previewRevision: number;
  readonly onCommit: (operation: PhotoEditOperation) => void;
  readonly onDraft: (operation: PhotoEditOperation) => void;
};

export type PhotoEditToolUiPlugin = {
  readonly id: string;
  readonly Controls?: (props: PhotoEditToolControlProps) => ReactNode;
  readonly Overlay?: (props: PhotoEditToolOverlayProps) => ReactNode;
};
