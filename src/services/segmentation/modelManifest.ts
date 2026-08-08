import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export type SegmentationModelInstallationState = 'not_installed' | 'available_for_verified_download' | 'manual_install_required' | 'downloading' | 'installed_and_verified' | 'installed_but_corrupt' | 'incompatible' | 'licence_review_required' | 'failed_installation';

export type SegmentationModelManifest = {
    modelId: string;
    providerId: 'fastsam' | 'efficientsam';
    displayName: string;
    purpose: string;
    variant: string;
    version: string;
    files: ReadonlyArray<{ fileName: string; sha256: string; approximateBytes: number }>;
    modelLicence: string;
    toolchainLicence?: string;
    attribution: string;
    verifiedSourceUrl?: string;
    manualInstallInstructions: string;
    automaticDownloadPermitted: boolean;
    redistributionReviewOutstanding: boolean;
};

export const segmentationModelManifests: readonly SegmentationModelManifest[] = [
    {
        modelId: 'fastsam-s-fp32', providerId: 'fastsam', displayName: 'FastSAM-s (local FP32)', purpose: 'Fast local instance mask proposals', variant: 'FastSAM-s', version: 'official-fastsam-s',
        files: [{ fileName: 'fastsam-s-fp32.onnx', sha256: 'fb28dd555a5e77dd0d60b48734a8b3f294883351bf0f3cb53a08e7cd9948abec', approximateBytes: 91_000_000 }],
        modelLicence: 'Apache-2.0 stated for FastSAM weights by upstream; redistribution review outstanding', toolchainLicence: 'Ultralytics AGPL-3.0 export tool used externally only', attribution: 'CASIA-LMC-Lab/FastSAM',
        manualInstallInstructions: 'Development build: export the verified official FastSAM-s checkpoint with tooling/scripts/core/export_fastsam_s_model.py, then place the resulting ONNX file in the PhotoStar models directory.', automaticDownloadPermitted: false, redistributionReviewOutstanding: true,
    },
    {
        modelId: 'efficient-sam-ti', providerId: 'efficientsam', displayName: 'EfficientSAM-Ti', purpose: 'Detailed prompted masks', variant: 'Ti split encoder/decoder', version: 'official-efficient-sam-ti',
        files: [
            { fileName: 'efficient_sam_vitt_encoder.onnx', sha256: '84ed466ffcc5c1f8d08409bc34a23bb364ab2c15e402cb12d4335a42be0e0951', approximateBytes: 24_799_761 },
            { fileName: 'efficient_sam_vitt_decoder.onnx', sha256: 'a62f8fa5ea080447c0689418d69e58f1e83e0b7adf9c142e2bd9bcc8045c0b11', approximateBytes: 16_565_728 },
        ],
        modelLicence: 'Apache-2.0', attribution: 'yformer/EfficientSAM', verifiedSourceUrl: 'https://huggingface.co/spaces/yunyangx/EfficientSAM', manualInstallInstructions: 'Run pnpm.cmd run download:efficientsam or place both verified files in the PhotoStar models directory.', automaticDownloadPermitted: true, redistributionReviewOutstanding: false,
    },
];

export function resolveSegmentationModelState(manifest: SegmentationModelManifest, modelDirectory: string): SegmentationModelInstallationState {
    const states = manifest.files.map((file) => {
        const path = `${modelDirectory}/${file.fileName}`;
        if (!existsSync(path)) { return 'missing' as const; }
        return createHash('sha256').update(readFileSync(path)).digest('hex') === file.sha256 ? 'verified' as const : 'corrupt' as const;
    });
    if (states.includes('corrupt')) { return 'installed_but_corrupt'; }
    if (states.every((state) => state === 'verified')) { return 'installed_and_verified'; }
    return manifest.automaticDownloadPermitted ? 'available_for_verified_download' : 'manual_install_required';
}
