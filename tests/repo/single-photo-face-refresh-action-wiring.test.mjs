import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('single-photo face refresh action resets and reruns face detection for the current photo', () => {
    const actionMenuSource = fs.readFileSync('src/ui/components/single-photo/ActionOverlayControls.tsx', 'utf8');
    const actionOverlaysSource = fs.readFileSync('src/ui/components/single-photo/ActionOverlays.tsx', 'utf8');
    const photoViewportSource = fs.readFileSync('src/ui/components/single-photo/PhotoViewport.tsx', 'utf8');
    const overlaySource = fs.readFileSync('src/ui/components/single-photo/SinglePhotoOverlay.tsx', 'utf8');
    const viewSource = fs.readFileSync('src/ui/components/SinglePhotoView.tsx', 'utf8');
    const photoLibrarySource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.ts', 'utf8');
    const faceActionsSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.faceSystemActions.ts', 'utf8');
    const handlerSource = fs.readFileSync('src/services/handlers/systemWorkflowRuntimeCommands.ts', 'utf8');
    const systemSource = fs.readFileSync('src/services/handlers/systemCommands.ts', 'utf8');

    assert.match(actionMenuSource, /Rerun Face Detection/);
    assert.match(actionMenuSource, /onRerunFaceDetection/);
    assert.match(actionOverlaysSource, /onRerunFaceDetection/);
    assert.match(photoViewportSource, /onRerunFaceDetection/);
    assert.match(photoViewportSource, /ViewportDecorations: FC<Pick<PhotoViewportFrameProps,[^>]+onRerunFaceDetection/s);
    assert.match(photoViewportSource, /onRerunFaceDetection=\{props\.onRerunFaceDetection\}/);
    assert.match(overlaySource, /onRerunFaceDetection/);
    assert.match(viewSource, /onRerunFaceDetection/);
    assert.match(photoLibrarySource, /createFaceSystemActions/);
    assert.match(photoLibrarySource, /const faceSystemActions = useMemo\(\(\) => createFaceSystemActions\(/);
    assert.match(photoLibrarySource, /return useMemo\(\(\) => \(\{/);
    assert.match(photoLibrarySource, /supplementaryActions\.faceSystemActions/);
    assert.match(faceActionsSource, /rerunFaceDetectionForAsset/);
    assert.match(faceActionsSource, /payload: \{ mediaId: assetId \}/);
    assert.match(handlerSource, /start_library_face_workflow/);
    assert.match(handlerSource, /startAssetWorkflow\(ctx, payload, \{\s*workflowId: 'library_face_pipeline_v1'/s);
    assert.match(systemSource, /const payload = ctx\.payload as \{ mediaId\?: string \} \| undefined;/);
});
