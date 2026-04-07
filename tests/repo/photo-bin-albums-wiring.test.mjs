import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

function readWorkspaceFile(relativePath) {
    return readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

test('albums view recognizes the protected Bin album and keeps it visible', () => {
    const albumsViewSource = readWorkspaceFile('src/ui/components/AlbumsView.tsx');
    const albumsViewModelSource = readWorkspaceFile('src/ui/components/albums/albumsViewModel.ts');

    assert.match(albumsViewModelSource, /export function isSystemAlbum/);
    assert.match(albumsViewModelSource, /export function isBinAlbum/);
    assert.match(albumsViewModelSource, /export function sortAlbumsForDisplay/);
    assert.match(albumsViewModelSource, /isBinAlbum\(album\) \? -1 : 0/);

    assert.match(albumsViewSource, /sortAlbumsForDisplay\(albums\)/);
    assert.match(albumsViewSource, /isSystemAlbum\(album\)/);
    assert.match(albumsViewSource, /System Album/);
    assert.doesNotMatch(albumsViewSource, /onDelete\(e, album\.id, album\.title\).*isSystemAlbum\(album\)/s);
    assert.match(albumsViewSource, /!isSystemAlbum\(album\) && \(/);
});
