import type React from 'react';
import type {
  ArchiveLineage,
  ArchiveLineageRepresentation,
  ArchiveLineageSubject,
} from '@contracts/archiveLineage';
import { Section } from './shared';

function filenameFromPath(value: string): string {
  return value.split(/[/\\]/).pop() || value;
}

function formatKind(value: ArchiveLineageRepresentation['representationKind']): string {
  switch (value) {
    case 'derived_edit': return 'Derived edit';
    case 'extracted_frame': return 'Extracted frame';
    case 'original': return 'Original';
    case 'scan': return 'Scan';
    case 'crop': return 'Crop';
    case 'reference': return 'Reference';
  }
}

function subjectTypeLabel(subject: ArchiveLineageSubject): string {
  return subject.kind === 'photograph' ? 'Photograph' : 'Physical artefact';
}

function representationDescriptor(representation: ArchiveLineageRepresentation): string {
  const parts = [formatKind(representation.representationKind)];
  if (representation.facet) {
    parts.push(representation.facet.charAt(0).toUpperCase() + representation.facet.slice(1));
  }
  return parts.join(' · ');
}

function sourceDescriptor(representation: ArchiveLineageRepresentation): string | null {
  if (representation.sourceRef) {
    return representation.sourceRef;
  }
  if (representation.sourceKind === 'human') {
    return 'Human-confirmed';
  }
  if (representation.sourceKind === 'import') {
    return 'Imported relationship';
  }
  return representation.sourceKind === 'system' ? 'System relationship' : null;
}

function findParent(
  subject: ArchiveLineageSubject,
  representation: ArchiveLineageRepresentation,
): ArchiveLineageRepresentation | null {
  if (!representation.derivedFromRepresentationId) {
    return null;
  }
  return subject.representations.find((candidate) => candidate.id === representation.derivedFromRepresentationId) ?? null;
}

function RelationshipRow(props: {
  readonly representation: ArchiveLineageRepresentation;
  readonly subject: ArchiveLineageSubject;
}) {
  const parent = findParent(props.subject, props.representation);
  const source = sourceDescriptor(props.representation);
  const fileLabel = filenameFromPath(props.representation.originalPath);

  return (
    <div className={`rounded-lg border p-2.5 ${
      props.representation.isCurrentAsset
        ? 'border-brand-accent/35 bg-brand-accent/5'
        : 'border-content/10 bg-surface/45'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-content break-all">
              {props.representation.isCurrentAsset ? 'This file' : fileLabel}
            </span>
            {props.representation.isCurrentAsset && (
              <span className="text-[9px] uppercase tracking-wide font-bold rounded px-1.5 py-0.5 bg-brand-accent/15 text-brand-accent">
                Current
              </span>
            )}
            {!props.representation.currentAssetId && !props.representation.isCurrentAsset && (
              <span className="text-[9px] uppercase tracking-wide font-bold rounded px-1.5 py-0.5 bg-content/5 text-content-secondary">
                Not in library
              </span>
            )}
          </div>
          {!props.representation.isCurrentAsset && (
            <div className="text-[10px] text-content-secondary/70 break-all mt-0.5">{props.representation.originalPath}</div>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-content-secondary font-medium">
          {representationDescriptor(props.representation)}
        </span>
      </div>
      {(parent || source) && (
        <div className="mt-2 pt-2 border-t border-content/5 grid gap-1 text-[10px] text-content-secondary">
          {parent && (
            <div>
              <span className="font-semibold">Derived from:</span>{' '}
              {parent.isCurrentAsset ? 'this file' : filenameFromPath(parent.originalPath)}
            </div>
          )}
          {source && <div><span className="font-semibold">Provenance:</span> {source}</div>}
        </div>
      )}
    </div>
  );
}

function SubjectCard({ subject }: { readonly subject: ArchiveLineageSubject }) {
  const currentRepresentations = subject.representations.filter((representation) => representation.isCurrentAsset);
  const relatedRepresentations = subject.representations.filter((representation) => !representation.isCurrentAsset);

  return (
    <div className="rounded-xl border border-content/10 bg-surface-secondary/35 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-content/10">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-content-secondary">
            {subjectTypeLabel(subject)}
          </span>
          <span className="text-[10px] text-content-secondary/70">
            {subject.representations.length} representation{subject.representations.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="text-xs font-semibold text-content mt-0.5">
          {subject.label ?? (subject.kind === 'photograph' ? 'Unlabelled photograph' : 'Unlabelled artefact')}
        </div>
      </div>
      <div className="p-2.5 grid gap-2">
        {currentRepresentations.map((representation) => (
          <RelationshipRow key={representation.id} representation={representation} subject={subject} />
        ))}
        {relatedRepresentations.length > 0 && (
          <div className="text-[10px] font-bold uppercase tracking-wide text-content-secondary/70 mt-1">
            Other representations
          </div>
        )}
        {relatedRepresentations.map((representation) => (
          <RelationshipRow key={representation.id} representation={representation} subject={subject} />
        ))}
      </div>
    </div>
  );
}

export const ArchiveRelationshipsSection: React.FC<{ readonly lineage?: ArchiveLineage | null }> = ({ lineage }) => {
  if (!lineage || lineage.subjects.length === 0) {
    return null;
  }

  return (
    <Section emoji="🧬" title="Archive Relationships">
      <div className="text-[11px] text-content-secondary leading-relaxed mb-2.5">
        How this file relates to the historical photograph or physical item, independently of gallery grouping.
      </div>
      <div className="grid gap-2.5">
        {lineage.subjects.map((subject) => <SubjectCard key={subject.entityId} subject={subject} />)}
      </div>
    </Section>
  );
};
