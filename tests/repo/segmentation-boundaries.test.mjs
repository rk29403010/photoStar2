import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('functional segmentation modules use only the neutral provider service', () => {
    assert.equal(fs.existsSync('src/services/faces/imageSegmentation.ts'), false);
    for (const file of [
        'src/services/workflowRuntime/modules/plugins/detect-frames/implementation.ts',
        'src/services/workflowRuntime/modules/plugins/detect-faces/implementation.ts',
        'src/services/workflowRuntime/modules/plugins/segment-objects/implementation.ts',
    ]) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /FastSamSegmentationProvider|EfficientSamSegmentationProvider|onnxruntime-node/);
    }
});
