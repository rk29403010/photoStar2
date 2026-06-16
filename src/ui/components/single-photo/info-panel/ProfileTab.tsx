import React, { useState, useEffect } from 'react';
import type { Asset, ReviewItemSummary, TagDefinitionSummary } from '@contracts/core';
import { Section } from './shared';
import { buildPhotoMetadataFileSummary } from './photoMetadataPanelModel';
import { TagManagementSection } from './TagManagementSection';

function getModelLabel(asset: Asset): string | undefined {
  const captionSource = asset.photo_metadata?.provenance?.caption?.sourceKind;
  if (captionSource === 'gemini_pro_refined') { return '✨ Pro refined'; }
  if (captionSource === 'gemini_flash_scout') { return '⚡ Flash scout'; }
  if (asset.ai_metadata?._analysis_tier === 'pro') { return '✨ Pro (3.1)'; }
  if (asset.ai_metadata?._analysis_tier === 'flash') { return '⚡ Flash (3)'; }
  return undefined;
}

function getSourceIcon(sourceKind: string | null | undefined): string {
  if (!sourceKind) { return ''; }
  const kind = sourceKind.toLowerCase();
  if (kind.includes('pro')) { return '✨'; }
  if (kind.includes('flash') || kind.includes('scout')) { return '⚡'; }
  if (kind.includes('manual') || kind.includes('user')) { return '👤'; }
  if (kind.includes('exif') || kind.includes('embedded') || kind.includes('file')) { return '📷'; }
  return 'ℹ️';
}

type EditFieldInputProps = {
  readonly label: string;
  readonly inputType: 'text' | 'textarea' | 'select';
  readonly inputValue: string;
  readonly setInputValue: (v: string) => void;
  readonly selectOptions: string[];
  readonly isSaving: boolean;
  readonly handleSave: () => void;
  readonly handleCancel: () => void;
  readonly errorText: string | null;
};

const EditFieldInput: React.FC<EditFieldInputProps> = ({
  label,
  inputType,
  inputValue,
  setInputValue,
  selectOptions,
  isSaving,
  handleSave,
  handleCancel,
  errorText,
}) => {
  let inputElement: React.ReactNode;
  if (inputType === 'textarea') {
    inputElement = (
      <textarea
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="flex-1 bg-surface text-content border border-content/15 rounded px-2 py-1 text-xs outline-none focus:border-brand-accent/50 resize-y min-h-[60px]"
        disabled={isSaving}
      />
    );
  } else if (inputType === 'select') {
    inputElement = (
      <select
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="flex-1 bg-surface text-content border border-content/15 rounded px-2 py-1 text-xs outline-none focus:border-brand-accent/50 cursor-pointer"
        disabled={isSaving}
      >
        <option value="">Select...</option>
        {selectOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  } else {
    inputElement = (
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="flex-1 bg-surface text-content border border-content/15 rounded px-2 py-1 text-xs outline-none focus:border-brand-accent/50"
        disabled={isSaving}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5 pb-3 border-b border-content/5 mt-1">
      <span className="text-[10px] text-content-secondary font-bold uppercase tracking-wider">{label}</span>
      <div className="flex gap-2">
        {inputElement}
        <div className="flex flex-col gap-1 shrink-0 justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-2 py-1 bg-brand-accent/20 hover:bg-brand-accent/30 text-brand-accent border border-brand-accent/35 rounded text-[11px] font-bold cursor-pointer motion-safe:transition-all disabled:opacity-50"
            title="Save override"
          >
            {isSaving ? '...' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-2 py-1 bg-content/5 hover:bg-content/10 text-content-secondary border border-content/10 rounded text-[11px] cursor-pointer motion-safe:transition-all disabled:opacity-50"
            title="Cancel"
          >
            Cancel
          </button>
        </div>
      </div>
      {errorText && <span className="text-[10px] text-rose-400 font-medium">{errorText}</span>}
    </div>
  );
};

type EditFieldDisplayProps = {
  readonly label: string;
  readonly value: string | null;
  readonly sourceKind?: string | null;
  readonly sourceLabel?: string;
  readonly onEdit: () => void;
};

const EditFieldDisplay: React.FC<EditFieldDisplayProps> = ({
  label,
  value,
  sourceKind,
  sourceLabel,
  onEdit,
}) => {
  const displayVal = value == null || value === '' ? '—' : value;
  const sourceIcon = getSourceIcon(sourceKind);

  return (
    <div className="flex gap-2 items-baseline pb-2 border-b border-content/5 mt-1.5 group select-none relative">
      <span className="text-xs text-content-secondary/80 font-bold w-24 shrink-0">{label}</span>
      <div className="flex-1 min-w-0 pr-12 flex items-center gap-1.5">
        <span className={`leading-relaxed break-all select-text text-xs ${value == null || value === '' ? 'text-content-secondary/50 italic' : 'text-content'}`}>
          {displayVal}
        </span>
        {sourceIcon && (
          <span 
            className="text-[11px] shrink-0 cursor-help"
            title={sourceLabel ? `${sourceLabel}` : undefined}
          >
            {sourceIcon}
          </span>
        )}
      </div>
      <button
        onClick={onEdit}
        className="opacity-0 group-hover:opacity-100 absolute right-1 top-1 text-content-secondary/60 hover:text-brand-accent text-xs transition-opacity cursor-pointer p-0.5 bg-transparent border-0"
        title={`Edit ${label}`}
      >
        ✏️
      </button>
    </div>
  );
};

type EditableFieldProps = {
  readonly label: string;
  readonly value: string | null;
  readonly sourceKind?: string | null;
  readonly sourceLabel?: string;
  readonly inputType?: 'text' | 'textarea' | 'select';
  readonly selectOptions?: string[];
  readonly onSave: (newValue: string) => Promise<void>;
};

const EditableField: React.FC<EditableFieldProps> = ({
  label,
  value,
  sourceKind,
  sourceLabel,
  inputType = 'text',
  selectOptions = [],
  onSave,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    setInputValue(value ?? '');
  }, [value]);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorText(null);
    try {
      await onSave(inputValue);
      setIsEditing(false);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <EditFieldInput
        label={label}
        inputType={inputType}
        inputValue={inputValue}
        setInputValue={setInputValue}
        selectOptions={selectOptions}
        isSaving={isSaving}
        handleSave={handleSave}
        handleCancel={() => { setIsEditing(false); setErrorText(null); }}
        errorText={errorText}
      />
    );
  }

  return (
    <EditFieldDisplay
      label={label}
      value={value}
      sourceKind={sourceKind}
      sourceLabel={sourceLabel}
      onEdit={() => setIsEditing(true)}
    />
  );
};

export const ProfileTab: React.FC<{
  readonly asset: Asset;
  readonly availableTags?: TagDefinitionSummary[];
  readonly onAssignTag?: (tagLabel: string) => Promise<void>;
  readonly onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
  readonly onSetReviewItemStatus?: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
  readonly onRecordPhotoMetadataAssertion?: (fieldPath: string, value: unknown, note?: string | null) => Promise<void>;
}> = ({
  asset,
  availableTags,
  onAssignTag,
  onRemoveTag,
  onSetReviewItemStatus,
  onRecordPhotoMetadataAssertion,
}) => {
  const summary = buildPhotoMetadataFileSummary(asset);
  const provenance = asset.photo_metadata?.provenance;

  const handleSaveField = async (fieldPath: string, newValue: string) => {
    if (!onRecordPhotoMetadataAssertion) {
      return;
    }
    // For date corrections, we assertions-write both display_label and most_likely_date
    if (fieldPath === 'estimated_date') {
      await onRecordPhotoMetadataAssertion('estimated_date.display_label', newValue, 'Manual profile tab edit');
      await onRecordPhotoMetadataAssertion('estimated_date.most_likely_date', newValue, 'Manual profile tab edit');
    } else {
      await onRecordPhotoMetadataAssertion(fieldPath, newValue, 'Manual profile tab edit');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Section emoji="🏷️" title="Synthesised Profile">
        <EditableField
          label="Caption"
          value={summary.caption}
          sourceKind={provenance?.caption?.sourceKind}
          sourceLabel={summary.captionSourceLabel}
          onSave={(val) => handleSaveField('caption', val)}
        />
        <EditableField
          label="Description"
          value={asset.photo_metadata?.projection.description ?? null}
          sourceKind={provenance?.description?.sourceKind}
          sourceLabel={provenance?.description?.sourceKind ? `Source: ${provenance.description.sourceKind}` : undefined}
          inputType="textarea"
          onSave={(val) => handleSaveField('description', val)}
        />
        <EditableField
          label="Type"
          value={summary.type}
          sourceKind={provenance?.type?.sourceKind}
          sourceLabel={summary.typeSourceLabel}
          inputType="select"
          selectOptions={['photo', 'document', 'drawing', 'newspaper', 'slide', 'negative', 'postcard']}
          onSave={(val) => handleSaveField('type', val)}
        />
        <EditableField
          label="Est. Date"
          value={summary.estimatedDateLabel}
          sourceKind={provenance?.estimatedDate?.display_label?.sourceKind ?? provenance?.estimatedDate?.sourceKind}
          sourceLabel={summary.estimatedDateSourceLabel}
          onSave={(val) => handleSaveField('estimated_date', val)}
        />
        <EditableField
          label="Location"
          value={summary.location}
          sourceKind={provenance?.location?.sourceKind}
          sourceLabel={summary.locationSourceLabel}
          onSave={(val) => handleSaveField('location', val)}
        />
        {summary.dateRationale && (
          <div className="mt-2 text-[11px] text-content-secondary/70 italic leading-relaxed pl-1">
            💡 <strong>Rationale:</strong> {summary.dateRationale}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between pl-1">
          <span className="text-[11px] text-content-secondary">Model: {getModelLabel(asset) ?? 'None'}</span>
          {Boolean(asset.ai_metadata?._pending_pro) && (
            <span className="text-[10px] text-amber-400 font-medium motion-safe:animate-pulse">⏳ Queued for enhanced pro analysis</span>
          )}
        </div>
      </Section>

      <TagManagementSection
        asset={asset}
        availableTags={availableTags}
        onAssignTag={onAssignTag}
        onRemoveTag={onRemoveTag}
        onSetReviewItemStatus={onSetReviewItemStatus}
      />
    </div>
  );
};
