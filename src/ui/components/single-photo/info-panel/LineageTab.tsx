import React from 'react';
import type { Asset } from '@contracts/core';
import { Section } from './shared';

type LineageItem = {
  source: string;
  value: string;
  timestamp?: string;
  author?: string;
  isApplied: boolean;
};

type FieldLineage = {
  fieldName: string;
  items: LineageItem[];
};

type MachineBlockRaw = {
  source_kind: string;
  provider: string;
  model_version?: string;
  data?: string | Record<string, unknown>;
  created_at: string;
};

function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) { return null; }
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) { return value; }
    return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return value;
  }
}

function parseBlockData(data: unknown): Record<string, unknown> {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>;
  }
  return {};
}

function extractManualAssertions(evidence: Record<string, unknown> | undefined, field: string, provenance: Record<string, unknown> | undefined): LineageItem[] {
  const items: LineageItem[] = [];
  if (!evidence?.manualAssertions) { return items; }

  const assertions = (evidence.manualAssertions as Array<{
    field_path: string;
    value_json?: string;
    value?: unknown;
    user_id: string;
    created_at: string;
  }>).filter((a) => a.field_path === field || (field === 'estimated_date' && a.field_path.startsWith('estimated_date.')));

  assertions.forEach((a) => {
    let val = '';
    if (a.value_json) {
      try {
        val = String(JSON.parse(a.value_json));
      } catch {
        val = String(a.value_json);
      }
    } else {
      val = String(a.value);
    }

    const estimatedDateSourceKind = (provenance?.estimatedDate as Record<string, unknown> | undefined)?.sourceKind;
    const generalFieldSourceKind = (provenance?.[field] as Record<string, unknown> | undefined)?.sourceKind;
    const isApplied = field === 'estimated_date'
      ? estimatedDateSourceKind === 'manual'
      : generalFieldSourceKind === 'manual';

    items.push({
      source: 'Manual Override',
      value: val,
      timestamp: a.created_at,
      author: a.user_id,
      isApplied,
    });
  });

  return items;
}

function getMachineBlockSourceName(sourceKind: string): string {
  if (sourceKind === 'gemini_pro_refined') { return 'VLM AI Pro'; }
  if (sourceKind === 'gemini_flash_scout') { return 'VLM AI Scout'; }
  if (sourceKind === 'embedded' || sourceKind === 'exif') { return 'EXIF Metadata'; }
  return sourceKind;
}

function isBlockApplied(field: string, provenance: Record<string, unknown> | undefined, sourceKind: string): boolean {
  if (field === 'estimated_date') {
    const dateProv = provenance?.estimatedDate as Record<string, unknown> | undefined;
    const dateDisplayProv = dateProv?.display_label as Record<string, unknown> | undefined;
    return dateProv?.sourceKind === sourceKind || dateDisplayProv?.sourceKind === sourceKind;
  }
  return (provenance?.[field] as Record<string, unknown> | undefined)?.sourceKind === sourceKind;
}

function processMachineBlock(block: MachineBlockRaw, field: string, provenance: Record<string, unknown> | undefined): LineageItem | null {
  const blockData = parseBlockData(block.data);
  let val: string | null = null;
  if (field === 'estimated_date') {
    const estDate = blockData['estimated_date'] as Record<string, unknown> | undefined;
    const display = estDate?.['display_label'] ?? blockData['estimated_date'] ?? blockData['display_label'];
    val = display ? String(display) : null;
  } else {
    val = blockData[field] ? String(blockData[field]) : null;
  }

  if (!val) { return null; }

  return {
    source: getMachineBlockSourceName(block.source_kind),
    value: val,
    timestamp: block.created_at,
    isApplied: isBlockApplied(field, provenance, block.source_kind),
  };
}

function extractMachineBlocks(evidence: Record<string, unknown> | undefined, field: string, provenance: Record<string, unknown> | undefined): LineageItem[] {
  const items: LineageItem[] = [];
  const blocks = evidence?.machineBlocks as MachineBlockRaw[] | undefined;
  if (!blocks) { return items; }

  for (const block of blocks) {
    const item = processMachineBlock(block, field, provenance);
    if (item) {
      items.push(item);
    }
  }

  return items;
}

function extractProjectedValueFallback(projection: Record<string, unknown> | undefined, field: string): LineageItem[] {
  if (!projection) { return []; }

  let value: unknown = null;
  if (field === 'estimated_date') {
    value = (projection.estimatedDate as Record<string, unknown> | undefined)?.display_label;
  } else {
    value = projection[field];
  }

  if (value) {
    return [{ source: 'Projected Value', value: String(value), isApplied: true }];
  }
  return [];
}

function getLineageForField(metadata: unknown, field: string): FieldLineage {
  const metaObj = metadata as Record<string, unknown> | null | undefined;
  const evidence = metaObj?.evidence as Record<string, unknown> | undefined;
  const provenance = metaObj?.provenance as Record<string, unknown> | undefined;
  const projection = metaObj?.projection as Record<string, unknown> | undefined;

  const items: LineageItem[] = [
    ...extractManualAssertions(evidence, field, provenance),
    ...extractMachineBlocks(evidence, field, provenance),
  ];

  if (items.length === 0) {
    items.push(...extractProjectedValueFallback(projection, field));
  }

  // Sort by timestamp desc (newest first)
  items.sort((a, b) => {
    if (!a.timestamp) { return 1; }
    if (!b.timestamp) { return -1; }
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return {
    fieldName: field.charAt(0).toUpperCase() + field.slice(1).replace('_', ' '),
    items,
  };
}

type MetadataLineageSectionProps = {
  readonly lineageList: FieldLineage[];
};

const MetadataLineageSection: React.FC<MetadataLineageSectionProps> = ({ lineageList }) => {
  return (
    <Section emoji="🔍" title="Metadata Lineage">
      <div className="flex flex-col gap-4">
        {lineageList.map((lineage) => (
          <div key={lineage.fieldName} className="bg-surface-secondary/40 border border-content/5 rounded-lg p-3">
            <div className="text-xs font-bold text-content mb-2 border-b border-content/5 pb-1 flex justify-between">
              <span>{lineage.fieldName}</span>
            </div>
            {lineage.items.length === 0 ? (
              <div className="text-[11px] text-content-secondary/60 italic">No values recorded</div>
            ) : (
              <div className="flex flex-col gap-2">
                {lineage.items.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded border text-xs flex justify-between items-start ${
                      item.isApplied
                        ? 'bg-brand-accent/5 border-brand-accent/30 text-content'
                        : 'bg-surface/50 border-content/10 text-content-secondary/80'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-[11px] flex items-center gap-1.5">
                        {item.source}
                        {item.author && <span className="font-normal text-[10px] text-content-secondary">· {item.author}</span>}
                        {item.isApplied && <span className="text-[9px] px-1 bg-brand-accent/20 text-brand-accent rounded font-bold uppercase tracking-wide">Applied</span>}
                      </span>
                      <span className="font-mono text-xs break-all select-text leading-relaxed mt-0.5">&ldquo;{item.value}&rdquo;</span>
                    </div>
                    {item.timestamp && (
                      <span className="text-[9px] text-content-secondary/60 shrink-0">
                        {formatDateOnly(item.timestamp)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
};

function getExifStep(asset: Asset) {
  const done = Boolean(asset.exif_datetime || asset.metadata_timestamp_source);
  let statusText = 'No captured date found';
  if (asset.exif_datetime) {
    try {
      statusText = `Captured on ${new Date(asset.exif_datetime).toLocaleDateString()}`;
    } catch {
      statusText = 'Invalid date';
    }
  }
  return { name: 'EXIF Metadata read', done, statusText };
}

function getFaceStep(asset: Asset) {
  const faceCount = asset.faces ? asset.faces.length : 0;
  const done = faceCount > 0;
  const statusText = done ? `Completed (${faceCount} faces found)` : 'No faces detected';
  return { name: 'Face Detection', done, statusText };
}

function getAiScoutStep(asset: Asset, projection: Record<string, unknown> | undefined) {
  const done = Boolean(asset.ai_metadata || projection?.caption || projection?.description);
  const statusText = done ? 'Completed (Flash metadata)' : 'Not started';
  return { name: 'AI Scout analysis', done, statusText };
}

function getAiProStep(asset: Asset, provenance: Record<string, unknown> | undefined) {
  const captionSource = (provenance?.caption as Record<string, unknown> | undefined)?.sourceKind;
  const hasAiPro = Boolean(captionSource === 'gemini_pro_refined' || asset.ai_metadata?._analysis_tier === 'pro');
  
  let statusText = 'Not started';
  if (hasAiPro) {
    statusText = 'Completed (Pro metadata)';
  } else if (asset.ai_metadata?._pending_pro) {
    statusText = 'Queued';
  }
  
  return { name: 'AI Pro refinement', done: hasAiPro, statusText };
}

function getDateStep(asset: Asset, projection: Record<string, unknown> | undefined) {
  const hasDateEstimate = Boolean(asset.photo_date_estimate || (projection?.estimatedDate as Record<string, unknown> | undefined)?.display_label);
  const statusText = hasDateEstimate ? 'Completed' : 'Pending';
  return { name: 'Date Heuristic estimation', done: hasDateEstimate, statusText };
}

type PipelineStatusChecklistProps = {
  readonly asset: Asset;
  readonly projection: Record<string, unknown> | undefined;
  readonly provenance: Record<string, unknown> | undefined;
};

const PipelineStatusChecklist: React.FC<PipelineStatusChecklistProps> = ({ asset, projection, provenance }) => {
  const pipeline = [
    { name: 'File Ingestion', done: true, statusText: 'Completed' },
    getExifStep(asset),
    getFaceStep(asset),
    getAiScoutStep(asset, projection),
    getAiProStep(asset, provenance),
    getDateStep(asset, projection),
  ];

  return (
    <Section emoji="⚙️" title="Pipeline Status Checklist">
      <div className="bg-surface-secondary/45 border border-content/5 rounded-lg p-3 flex flex-col gap-2">
        {pipeline.map((step) => (
          <div key={step.name} className="flex justify-between items-center py-1.5 border-b border-content/5 last:border-b-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm ${step.done ? 'text-emerald-400' : 'text-content-secondary/40'}`}>
                {step.done ? '✓' : '○'}
              </span>
              <span className="text-xs font-medium text-content">{step.name}</span>
            </div>
            <span className={`text-[11px] ${step.done ? 'text-content-secondary' : 'text-content-secondary/60 italic'}`}>
              {step.statusText}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
};

export const LineageTab: React.FC<{ readonly asset: Asset }> = ({ asset }) => {
  const metadata = asset.photo_metadata;
  const projection = metadata?.projection as Record<string, unknown> | undefined;
  const provenance = metadata?.provenance as Record<string, unknown> | undefined;

  // 1. Gather lineage data for key fields
  const fields = ['caption', 'description', 'type', 'location', 'estimated_date'];
  const lineageList = fields.map((field) => getLineageForField(metadata, field));

  return (
    <div className="flex flex-col gap-4 text-content select-none">
      <MetadataLineageSection lineageList={lineageList} />
      <PipelineStatusChecklist asset={asset} projection={projection} provenance={provenance} />
    </div>
  );
};
