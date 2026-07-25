import type { PhotoEditToolPlugin } from '../../../photoEditToolPlugin.ts'; import { applyCrop } from '../../../editRenderer.ts'; import { frameCropBox } from '../../../../../shared/photoEditing/automatic.ts';

function suggestCrop({ analysis, context, semanticGeometrySafe }: Parameters<NonNullable<PhotoEditToolPlugin['suggest']>>[0]) {
  if (!semanticGeometrySafe) { return null; }
  const detectedFrame = frameCropBox(context);
  const box = detectedFrame ?? analysis.attentionCrop;
  if (!box || box.width * box.height > 0.94) { return null; }
  return {
    confidence: detectedFrame ? 0.98 : Math.min(0.82, analysis.confidence),
    id: detectedFrame ? 'automatic-frame-crop' : 'automatic-attention-crop',
    label: detectedFrame ? 'Remove detected frame' : 'Crop around the subject',
    name: detectedFrame ? 'Remove detected frame' : 'Smart subject crop',
    rationale: detectedFrame ? 'Uses the photo boundary saved by the ingest workflow.' : 'Keeps detected faces and important regions with comfortable breathing room.',
    requiresSemanticGeometry: true,
    values: { ...box },
  };
}

export const cropPlugin: PhotoEditToolPlugin = { id: 'crop', recipeVersion: 1, label: 'Crop', icon: 'Crop', group: 'geometry', defaults: { x: 0, y: 0, width: 1, height: 1 }, controls: [{ key: 'x', label: 'Left', min: 0, max: 0.95, step: 0.01 }, { key: 'y', label: 'Top', min: 0, max: 0.95, step: 0.01 }, { key: 'width', label: 'Width', min: 0.05, max: 1, step: 0.01 }, { key: 'height', label: 'Height', min: 0.05, max: 1, step: 0.01 }], renderExact: (input, operation) => applyCrop(input, operation), capabilities: { geometryChanges: true, maskCompatible: false }, suggest: suggestCrop, help: { description: 'Changes image framing.', accessibilityLabel: 'Add crop' }, errorBoundaryDisplayName: 'Crop' };
