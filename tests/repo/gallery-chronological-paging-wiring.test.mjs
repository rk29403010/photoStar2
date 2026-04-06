import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('library paging threads the selected gallery order into initial and load-more asset requests', () => {
    const stateSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.state.ts', 'utf8');
    const galleryPayloadSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.gallery.ts', 'utf8');
    const hookSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.ts', 'utf8');
    const connectionSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.connection.ts', 'utf8');

    assert.match(stateSource, /galleryOrderRef = useRef/);
    assert.match(stateSource, /gallerySeekRef = useRef/);
    assert.match(galleryPayloadSource, /galleryOrder: options\.galleryOrder \?\? .*galleryOrderRef\.current/);
    assert.match(galleryPayloadSource, /galleryOrder: params\.galleryOrderRef\.current/);
    assert.match(galleryPayloadSource, /gallerySeek: options\.gallerySeek \?\? .*gallerySeekRef\.current/);
    assert.match(galleryPayloadSource, /gallerySeek: params\.gallerySeekRef\.current/);
    assert.match(hookSource, /galleryOrderRef/);
    assert.match(hookSource, /gallerySeekRef/);
    assert.match(connectionSource, /galleryOrder/);
});
