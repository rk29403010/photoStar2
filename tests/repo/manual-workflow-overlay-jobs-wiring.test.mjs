import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('manual pipeline workflows create overlay jobs and schedule run refresh', () => {
    const source = read('src/boundary/runtime/usePhotoLibrary.commands.ts');

    assert.match(source, /startWorkflowWithOverlayJob/);
    assert.match(source, /generatePreviews: \(\) => startWorkflow\('start_library_previews', 'start_library_preview_workflow', 'preview_generation', 'Generating Library Previews'\)/);
    assert.match(source, /detectFaces: \(mediaId\?: string\) => startWorkflow\('start_library_face', 'start_library_face_workflow', 'face_analysis'/);
    assert.match(source, /clusterFaces: \(\) => startWorkflow\('start_library_grouping_from_faces', 'start_library_grouping', 'similarity_cluster'/);
    assert.match(source, /scanSensitive: \(\) => startWorkflow\('start_library_sensitive', 'start_library_sensitive_scan_workflow', 'sensitive_scan'/);
    assert.match(source, /extractAiMetadata:[\s\S]*start_selected_subject_metadata_workflow', 'ai_metadata', 'Generating AI Metadata'/);
});

test('single-photo face rerun creates an overlay job and schedules workflow refresh', () => {
    const source = read('src/boundary/runtime/usePhotoLibrary.faceSystemActions.ts');

    assert.match(source, /startWorkflowWithOverlayJob/);
    assert.match(source, /stage: 'face_analysis'/);
    assert.match(source, /title: 'Analysing Faces for Photo'/);
    assert.match(source, /refreshLibrary\(\{ preservePagingState: true \}\)/);
});

test('usePhotoLibrary composes addJob and updateJobState into manual workflow actions', () => {
    const source = read('src/ui/hooks/usePhotoLibrary.ts');

    assert.match(source, /createPipelineActions\(\{\s*request,\s*addJob,\s*updateJobState,\s*refreshLibrary,\s*refreshSystemJobs,\s*\}\)/s);
    assert.match(source, /createFaceSystemActions\(\{\s*addJob,\s*request,\s*updateJobState,/s);
});

test('overlay job completion preserves paging state when refreshing the library', () => {
    const source = read('src/boundary/runtime/workflowOverlayJobs.ts');

    assert.match(source, /status === 'completed'[\s\S]*refreshLibrary\(\{ preservePagingState: true \}\)/);
});
