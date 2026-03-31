import type { Asset } from '@contracts/core';

export type AssetUpdateInstruction =
    | { kind: 'merge'; asset: Pick<Asset, 'id'> & Partial<Asset> }
    | { kind: 'refresh'; assetId: string };

export function getAssetUpdateInstruction(event: Record<string, unknown>): AssetUpdateInstruction | null {
    const asset = event.asset;
    if (asset && typeof asset === 'object' && !Array.isArray(asset)) {
        const assetRecord = asset as Record<string, unknown>;
        if (typeof assetRecord.id === 'string' && assetRecord.id.length > 0) {
            return { kind: 'merge', asset: assetRecord as Pick<Asset, 'id'> & Partial<Asset> };
        }
    }

    if (typeof event.assetId === 'string' && event.assetId.length > 0) {
        return { kind: 'refresh', assetId: event.assetId };
    }

    return null;
}
