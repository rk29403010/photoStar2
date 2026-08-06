import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Asset } from '@contracts/core';
import { Section } from './shared';
import { buildPhotoMetadataFileSummary } from './photoMetadataPanelModel';
import { globalRequest } from '../../../hooks/usePhotoLibrary';

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

type SeamlessFieldControlProps = {
  readonly inputType: 'text' | 'textarea' | 'select';
  readonly localValue: string;
  readonly isSaving: boolean;
  readonly options: string[];
  readonly textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  readonly onChange: (val: string) => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
};

const SeamlessFieldControl: React.FC<SeamlessFieldControlProps> = ({
  inputType,
  localValue,
  isSaving,
  options,
  textareaRef,
  onChange,
  onFocus,
  onBlur,
}) => {
  const inputBaseClass = "w-full bg-transparent text-content text-xs leading-relaxed outline-none border-0 border-b border-dashed border-transparent hover:border-brand-accent/30 focus:border-brand-accent focus:ring-0 transition-colors p-0 rounded-none shadow-none font-sans";

  if (inputType === 'textarea') {
    return (
      <textarea
        ref={textareaRef}
        value={localValue}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`${inputBaseClass} resize-none overflow-hidden`}
        disabled={isSaving}
        rows={1}
      />
    );
  }
  if (inputType === 'select') {
    return (
      <div className="relative w-full flex-1">
        <select
          value={localValue}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className={`${inputBaseClass} appearance-none pr-5 cursor-pointer py-0.5`}
          disabled={isSaving}
        >
          <option value="" className="bg-surface text-content">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt} className="bg-surface text-content">{opt}</option>
          ))}
        </select>
        <svg className="w-3.5 h-3.5 text-content-secondary/60 pointer-events-none absolute right-1 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    );
  }
  return (
    <input
      type="text"
      value={localValue}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      className={inputBaseClass}
      disabled={isSaving}
    />
  );
};

type SeamlessFieldProps = {
  readonly label: string;
  readonly value: string | null;
  readonly inputType?: 'text' | 'textarea' | 'select';
  readonly selectOptions?: string[];
  readonly layout?: 'row' | 'block';
  readonly sourceKind?: string | null;
  readonly sourceLabel?: string;
  readonly tooltip?: string | null;
  readonly onSave: (newValue: string) => Promise<void>;
};

function clearTimer(ref: { current: NodeJS.Timeout | null }) {
  if (ref.current) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

function useSeamlessFieldSave(
  value: string | null,
  onSave: (newValue: string) => Promise<void>
) {
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const propValueRef = useRef(value ?? '');

  useEffect(() => {
    propValueRef.current = value ?? '';
  }, [value]);

  const triggerSave = useCallback(async (valToSave: string) => {
    const trimmed = valToSave.trim();
    if (trimmed === propValueRef.current) { return; }
    setIsSaving(true);
    setErrorText(null);
    try {
      await onSave(trimmed);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [onSave]);

  return { isSaving, errorText, triggerSave, propValueRef };
}

function useSeamlessFieldState(
  value: string | null,
  inputType: 'text' | 'textarea' | 'select',
  onSave: (newValue: string) => Promise<void>
) {
  const [localValue, setLocalValue] = useState(value ?? '');
  const [isFocused, setIsFocused] = useState(false);
  const { isSaving, errorText, triggerSave, propValueRef } = useSeamlessFieldSave(value, onSave);

  const localValueRef = useRef(localValue);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    localValueRef.current = localValue;
  }, [localValue]);

  useEffect(() => {
    if (!isFocused) { setLocalValue(value ?? ''); }
  }, [value, isFocused]);

  const handleChange = useCallback((newVal: string) => {
    setLocalValue(newVal);
    clearTimer(saveTimeoutRef);
    saveTimeoutRef.current = setTimeout(() => {
      void triggerSave(localValueRef.current);
    }, 2000);
  }, [triggerSave]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    clearTimer(saveTimeoutRef);
    void triggerSave(localValueRef.current);
  }, [triggerSave]);

  useEffect(() => {
    return () => {
      clearTimer(saveTimeoutRef);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Reading latest ref values at unmount to save any pending edits
      if (localValueRef.current !== propValueRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Save local change using latest ref value on unmount
        void triggerSave(localValueRef.current);
      }
    };
  }, [triggerSave, propValueRef]);

  useEffect(() => {
    if (inputType === 'textarea' && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [localValue, inputType]);

  return {
    localValue,
    isSaving,
    errorText,
    textareaRef,
    handleChange,
    handleBlur,
    setIsFocused,
  };
}

const SeamlessFieldLayout: React.FC<{
  readonly layout: 'row' | 'block';
  readonly label: string;
  readonly control: React.ReactNode;
  readonly sourceIcon: string;
  readonly resolvedTooltip: string | undefined;
  readonly errorText: string | null;
}> = ({ layout, label, control, sourceIcon, resolvedTooltip, errorText }) => {
  const iconEl = sourceIcon ? (
    <span className="text-[11px] shrink-0 cursor-help" title={resolvedTooltip}>
      {sourceIcon}
    </span>
  ) : null;

  if (layout === 'block') {
    return (
      <div className="flex flex-col pb-2 border-b border-content/5 mt-1.5 border border-transparent rounded p-1.5 -mx-1.5 relative w-full">
        <div className="flex items-center gap-1.5 w-full mb-1">
          <span className="text-xs text-content-secondary/80 font-bold">{label}</span>
          {iconEl}
        </div>
        <div className="w-full">{control}</div>
        {errorText && <span className="text-[10px] text-rose-400 mt-1 font-medium">{errorText}</span>}
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-center pb-2 border-b border-content/5 mt-1.5 border border-transparent rounded p-1.5 -mx-1.5 w-full relative">
      <span className="text-xs text-content-secondary/80 font-bold w-18 shrink-0">{label}</span>
      <div className="flex-1 min-w-0 flex items-center gap-1.5 w-full">
        {control}
        {iconEl}
      </div>
      {errorText && <span className="text-[10px] text-rose-400 font-medium absolute bottom-0 right-0">{errorText}</span>}
    </div>
  );
};

const SeamlessField: React.FC<SeamlessFieldProps> = ({
  label,
  value,
  inputType = 'text',
  selectOptions = [],
  layout = 'row',
  sourceKind,
  sourceLabel,
  tooltip,
  onSave,
}) => {
  const {
    localValue,
    isSaving,
    errorText,
    textareaRef,
    handleChange,
    handleBlur,
    setIsFocused,
  } = useSeamlessFieldState(value, inputType, onSave);

  const sourceIcon = getSourceIcon(sourceKind);
  const resolvedTooltip = sourceIcon === '⚡' && tooltip ? `${sourceLabel ? `${sourceLabel} - ` : ''}Rationale: ${tooltip}` : sourceLabel;

  const options = useMemo(() => {
    if (inputType !== 'select') { return []; }
    return Array.from(new Set([...selectOptions, ...(value ? [value] : [])])).filter(Boolean);
  }, [inputType, selectOptions, value]);

  const control = (
    <SeamlessFieldControl
      inputType={inputType}
      localValue={localValue}
      isSaving={isSaving}
      options={options}
      textareaRef={textareaRef}
      onChange={handleChange}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
    />
  );

  return (
    <SeamlessFieldLayout
      layout={layout}
      label={label}
      control={control}
      sourceIcon={sourceIcon}
      resolvedTooltip={resolvedTooltip}
      errorText={errorText}
    />
  );
};

function useProfileTabTypes(assetId: string) {
  const [dbTypes, setDbTypes] = useState<string[]>(['photo', 'document', 'drawing', 'newspaper', 'slide', 'negative', 'postcard']);

  useEffect(() => {
    let active = true;
    const loadTypes = async () => {
      try {
        if (!globalRequest) { return; }
        const result = await globalRequest<string[]>({
          idPrefix: 'get_available_asset_types',
          command: 'get_available_asset_types',
          payload: {},
          timeoutMs: 10000,
          select: (data) => (data?.types || []) as string[],
        });
        if (active && result && result.length > 0) {
          setDbTypes(result);
        }
      } catch (err) {
        console.error('Failed to load asset types', err);
      }
    };
    void loadTypes();
    return () => {
      active = false;
    };
  }, [assetId]);

  return dbTypes;
}

function useProfileFieldSaver(
  recordAssertion?: (fieldPath: string, value: unknown, note?: string | null) => Promise<void>,
) {
  return useCallback(async (fieldPath: string, newValue: string) => {
    if (!recordAssertion) {
      return;
    }
    if (fieldPath === 'estimated_date') {
      await recordAssertion('estimated_date.display_label', newValue, 'Manual profile tab edit');
      await recordAssertion('estimated_date.most_likely_date', newValue, 'Manual profile tab edit');
      return;
    }
    await recordAssertion(fieldPath, newValue, 'Manual profile tab edit');
  }, [recordAssertion]);
}

export const ProfileTab: React.FC<{
  readonly asset: Asset;
  readonly onRecordPhotoMetadataAssertion?: (fieldPath: string, value: unknown, note?: string | null) => Promise<void>;
}> = ({
  asset,
  onRecordPhotoMetadataAssertion,
}) => {
  const summary = buildPhotoMetadataFileSummary(asset);
  const provenance = asset.photo_metadata?.provenance;
  const dbTypes = useProfileTabTypes(asset.id);
  const handleSaveField = useProfileFieldSaver(onRecordPhotoMetadataAssertion);

  return (
    <div className="flex flex-col gap-4">
      <Section emoji="🏷️" title="Synthesised Profile" hideHeader>
        <SeamlessField
          key={`${asset.id}-caption`}
          label="Caption"
          value={summary.caption}
          sourceKind={provenance?.caption?.sourceKind}
          sourceLabel={summary.captionSourceLabel}
          inputType="textarea"
          layout="block"
          onSave={(val) => handleSaveField('caption', val)}
        />
        <SeamlessField
          key={`${asset.id}-description`}
          label="Description"
          value={asset.photo_metadata?.projection.description ?? null}
          sourceKind={provenance?.description?.sourceKind}
          sourceLabel={provenance?.description?.sourceKind ? `Source: ${provenance.description.sourceKind}` : undefined}
          inputType="textarea"
          layout="block"
          onSave={(val) => handleSaveField('description', val)}
        />
        <SeamlessField
          key={`${asset.id}-type`}
          label="Type"
          value={summary.type}
          sourceKind={provenance?.type?.sourceKind}
          sourceLabel={summary.typeSourceLabel}
          inputType="select"
          selectOptions={dbTypes}
          onSave={(val) => handleSaveField('type', val)}
        />
        <SeamlessField
          key={`${asset.id}-estDate`}
          label="Est. Date"
          value={summary.estimatedDateLabel}
          sourceKind={provenance?.estimatedDate?.display_label?.sourceKind ?? provenance?.estimatedDate?.sourceKind}
          sourceLabel={summary.estimatedDateSourceLabel}
          tooltip={summary.dateRationale}
          onSave={(val) => handleSaveField('estimated_date', val)}
        />
        <SeamlessField
          key={`${asset.id}-location`}
          label="Location"
          value={summary.location}
          sourceKind={provenance?.location?.sourceKind}
          sourceLabel={summary.locationSourceLabel}
          onSave={(val) => handleSaveField('location', val)}
        />
        <div className="mt-3 flex items-center justify-between pl-1">
          <span className="text-[11px] text-content-secondary">Model: {getModelLabel(asset) ?? 'None'}</span>
          {Boolean(asset.ai_metadata?._pending_pro) && (
            <span className="text-[10px] text-amber-400 font-medium motion-safe:animate-pulse">⏳ Queued for enhanced pro analysis</span>
          )}
        </div>
      </Section>
    </div>
  );
};
