import React, { useEffect, useMemo, useState } from 'react';
import type { Asset } from '@contracts/core';
import type { PhotoDateCorrectionInput, PhotoDateReviewReasonCode } from '@ui/hooks/usePhotoDateReviewHandler';
import { Field, Section, Tag } from './shared';
import { buildPhotoDateDiagnosticsSummary } from './photoDateDiagnosticsModel';

const REVIEW_REASON_OPTIONS: Array<{ value: PhotoDateReviewReasonCode; label: string }> = [
  { value: 'ai_right_metadata_wrong', label: 'AI right, metadata wrong' },
  { value: 'scanned_or_edited', label: 'Scanned or edited' },
  { value: 'born_digital_exif_wrong', label: 'Born-digital EXIF wrong' },
  { value: 'ai_wrong_metadata_right', label: 'AI wrong, metadata right' },
  { value: 'manual_family_knowledge', label: 'Manual family knowledge' },
];

function getInitialCorrectedDate(asset: Asset): string {
  return asset.photo_metadata?.projection.estimatedDate.most_likely_date
    ?? asset.photo_metadata?.projection.estimatedDate.display_label
    ?? asset.photo_created_at?.slice(0, 10)
    ?? '';
}

function SignalList({ asset }: { readonly asset: Asset }) {
  const diagnostics = buildPhotoDateDiagnosticsSummary(asset);
  if (diagnostics.confidenceLabel == null && diagnostics.signals.length === 0) {
    return null;
  }

  return (
    <>
      <Field label="Confidence" value={diagnostics.confidenceLabel} />
      <Field label="Range" value={diagnostics.rangeLabel} />
      {diagnostics.reasons.length > 0 && (
        <div className="pb-2">
          <div className="text-[10px] text-content-secondary font-bold uppercase mb-1">Confidence Notes</div>
          <div className="grid gap-1">
            {diagnostics.reasons.map((reason) => <div key={reason} className="text-xs text-content leading-relaxed">{reason}</div>)}
          </div>
        </div>
      )}
      {diagnostics.signals.length > 0 && (
        <div>
          <div className="text-[10px] text-content-secondary font-bold uppercase mb-1">Top Signals</div>
          <div className="flex flex-wrap gap-1">
            {diagnostics.signals.slice(0, 5).map((signal) => (
              <Tag key={`${signal.label}-${signal.weightLabel}`} text={`${signal.originLabel} · ${signal.label} · ${signal.weightLabel}`} color="#20314f" />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function StatusMessage({ message }: { readonly message: string | null }) {
  if (!message) {return null;}
  return <div className="mt-2.5 text-xs text-sky-400 leading-relaxed">{message}</div>;
}

function StartReviewButton({ onStart }: { readonly onStart: () => void }) {
  return (
    <button onClick={onStart} className="mt-2.5 px-2.5 py-1.5 border border-brand-accent/30 bg-brand-accent/10 text-brand-accent rounded cursor-pointer text-xs font-bold hover:bg-brand-accent/20 active:scale-95 motion-safe:transition-all">
      Flag Wrong Date
    </button>
  );
}

type CorrectionFormProps = {
  readonly correctedDate: string;
  readonly isSaving: boolean;
  readonly note: string;
  readonly onCancel: () => void;
  readonly onCorrectedDateChange: (value: string) => void;
  readonly onNoteChange: (value: string) => void;
  readonly onReasonCodeChange: (value: PhotoDateReviewReasonCode) => void;
  readonly onSave: () => void;
  readonly reasonCode: PhotoDateReviewReasonCode;
};

function CorrectionForm({
  correctedDate,
  isSaving,
  note,
  onCancel,
  onCorrectedDateChange,
  onNoteChange,
  onReasonCodeChange,
  onSave,
  reasonCode,
}: CorrectionFormProps) {
  const saveDisabled = isSaving || correctedDate.trim().length === 0;

  return (
    <div className="mt-3 border border-content/10 rounded-lg p-3 bg-surface-secondary/45 flex flex-col gap-2.5">
      <div className="grid gap-2.5">
        <label className="grid gap-1">
          <span className="text-[10px] text-content-secondary font-bold uppercase">Correct Date</span>
          <input value={correctedDate} onChange={(event) => onCorrectedDateChange(event.target.value)} placeholder="1945 or early 1990s" className="bg-surface text-content border border-content/10 rounded px-2.5 py-1.5 text-xs outline-none focus:border-brand-accent/50" />
        </label>
        <label className="grid gap-1">
          <span className="text-[10px] text-content-secondary font-bold uppercase">Reason</span>
          <select value={reasonCode} onChange={(event) => onReasonCodeChange(event.target.value as PhotoDateReviewReasonCode)} className="bg-surface text-content border border-content/10 rounded px-2.5 py-1.5 text-xs outline-none cursor-pointer">
            {REVIEW_REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[10px] text-content-secondary font-bold uppercase">Note</span>
          <textarea value={note} onChange={(event) => onNoteChange(event.target.value)} rows={3} placeholder="What looked wrong here?" className="bg-surface text-content border border-content/10 rounded px-2.5 py-1.5 text-xs outline-none resize-y" />
        </label>
      </div>
      <div className="flex gap-2 mt-3 justify-end">
        <button onClick={onCancel} disabled={isSaving} className="px-2.5 py-1.5 border border-content/10 bg-transparent text-content-secondary rounded cursor-pointer text-xs font-bold hover:bg-surface-secondary/80 disabled:opacity-50 transition-colors">
          Cancel
        </button>
        <button onClick={onSave} disabled={saveDisabled} className="px-2.5 py-1.5 border border-brand-accent/30 bg-brand-accent/15 text-brand-accent rounded cursor-pointer text-xs font-bold hover:bg-brand-accent/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed motion-safe:transition-all">
          {isSaving ? 'Saving...' : 'Save Review'}
        </button>
      </div>
    </div>
  );
}

export const PhotoDateReviewSection: React.FC<{
  readonly asset: Asset;
  readonly onFlagPhotoDateCorrection?: (input: PhotoDateCorrectionInput) => Promise<void>;
}> = ({ asset, onFlagPhotoDateCorrection }) => {
  const initialDate = useMemo(() => getInitialCorrectedDate(asset), [asset]);
  const [isEditing, setIsEditing] = useState(false);
  const [correctedDate, setCorrectedDate] = useState(initialDate);
  const [reasonCode, setReasonCode] = useState<PhotoDateReviewReasonCode>('ai_right_metadata_wrong');
  const [note, setNote] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCorrectedDate(initialDate);
    setReasonCode('ai_right_metadata_wrong');
    setNote('');
    setStatusMessage(null);
    setIsEditing(false);
  }, [asset.id, initialDate]);

  const submitCorrection = async () => {
    if (!onFlagPhotoDateCorrection || correctedDate.trim().length === 0) {
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    try {
      await onFlagPhotoDateCorrection({
        assetId: asset.id,
        correctedDate,
        reasonCode,
        note,
      });
      setIsEditing(false);
      setStatusMessage('Correction saved. Photo date recalculation started.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to save date correction.');
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setStatusMessage(null);
  };

  const reviewControls = (function () {
    if (onFlagPhotoDateCorrection == null) {
      return null;
    }
    if (isEditing) {
      return (
        <CorrectionForm
          correctedDate={correctedDate}
          isSaving={isSaving}
          note={note}
          onCancel={cancelEditing}
          onCorrectedDateChange={setCorrectedDate}
          onNoteChange={setNote}
          onReasonCodeChange={setReasonCode}
          onSave={() => { void submitCorrection(); }}
          reasonCode={reasonCode}
        />
      );
    }
    return <StartReviewButton onStart={() => setIsEditing(true)} />;
  }());

  return (
    <Section emoji="🗓️" title="Date Review">
      <SignalList asset={asset} />
      <StatusMessage message={statusMessage} />
      {reviewControls}
    </Section>
  );
};
