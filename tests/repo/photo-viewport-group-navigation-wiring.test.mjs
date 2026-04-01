import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('photo viewport keeps group navigation tied to the selected asset during image transitions', () => {
    const viewportSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/single-photo/PhotoViewport.tsx'), 'utf8');
    const assetModelSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/single-photo/singlePhotoAssetModel.ts'), 'utf8');

    assert.match(assetModelSource, /export function resolveActiveSinglePhotoGroupId\(asset: Asset, previousActiveGroupId: string \| null\): string \| null/);
    assert.match(viewportSource, /selectedAsset: Asset;/);
    assert.match(viewportSource, /asset=\{selectedAsset\}/);
    assert.match(viewportSource, /resolveActiveSinglePhotoGroupId\(props\.asset, previousActiveGroupId\)/);
});
