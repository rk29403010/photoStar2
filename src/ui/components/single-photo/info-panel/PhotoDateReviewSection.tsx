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
        <div style={{ paddingBottom: 8 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Confidence Notes</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {diagnostics.reasons.map((reason) => <div key={reason} style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>{reason}</div>)}
          </div>
        </div>
      )}
      {diagnostics.signals.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Top Signals</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
  return <div style={{ marginTop: 10, fontSize: 12, color: '#93c5fd', lineHeight: 1.5 }}>{message}</div>;
}

function StartReviewButton({ onStart }: { readonly onStart: () => void }) {
  return (
    <button onClick={onStart} style={{ marginTop: 10, padding: '7px 10px', background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(96,165,250,0.35)', borderRadius: 8, color: '#dbeafe', cursor: 'pointer', fontSize: 12 }}>
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
    <div style={{ marginTop: 12, border: '1px solid rgba(51,65,85,0.9)', borderRadius: 10, padding: 12, background: 'rgba(8,15,30,0.75)' }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Correct Date</span>
          <input value={correctedDate} onChange={(event) => onCorrectedDateChange(event.target.value)} placeholder="1945 or early 1990s" style={{ background: '#020617', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12 }} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Reason</span>
          <select value={reasonCode} onChange={(event) => onReasonCodeChange(event.target.value as PhotoDateReviewReasonCode)} style={{ background: '#020617', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12 }}>
            {REVIEW_REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Note</span>
          <textarea value={note} onChange={(event) => onNoteChange(event.target.value)} rows={3} placeholder="What looked wrong here?" style={{ background: '#020617', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontSize: 12, resize: 'vertical' }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onCancel} disabled={isSaving} style={{ padding: '7px 10px', background: 'transparent', border: '1px solid #334155', borderRadius: 8, color: '#cbd5e1', cursor: isSaving ? 'wait' : 'pointer', fontSize: 12 }}>
          Cancel
        </button>
        <button onClick={onSave} disabled={saveDisabled} style={{ padding: '7px 10px', background: 'rgba(14,165,233,0.18)', border: '1px solid rgba(56,189,248,0.4)', borderRadius: 8, color: '#e0f2fe', cursor: isSaving ? 'wait' : 'pointer', fontSize: 12 }}>
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

  const reviewControls = onFlagPhotoDateCorrection == null
    ? null
    : isEditing
      ? (
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
      )
      : <StartReviewButton onStart={() => setIsEditing(true)} />;

  return (
    <Section emoji="🗓️" title="Date Review">
      <SignalList asset={asset} />
      <StatusMessage message={statusMessage} />
      {reviewControls}
    </Section>
  );
};
