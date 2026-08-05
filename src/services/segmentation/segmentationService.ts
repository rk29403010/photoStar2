import { FastSamSegmentationProvider } from './fastSamSegmentationProvider';
import { EfficientSamSegmentationProvider } from './efficientSamSegmentationProvider';
import type { SegmentationProcessingProfile, SegmentationProvider, SegmentationProviderSelection } from './contracts';

export type SegmentationResolution = { requested: SegmentationProviderSelection; used: SegmentationProvider; };
function defaultProviders(): SegmentationProvider[] { return [new FastSamSegmentationProvider(), new EfficientSamSegmentationProvider()]; }
export function createSegmentationProviders(selection: SegmentationProviderSelection | 'both', profile: SegmentationProcessingProfile): SegmentationProvider[] {
    if (selection === 'both') { return [new FastSamSegmentationProvider(), new EfficientSamSegmentationProvider()]; }
    // Workflow modules must receive an unavailable requested provider so they can
    // report a typed, non-destructive processing issue. Resolution is only for
    // choosing an available provider for `auto`.
    if (selection === 'fastsam') { return [new FastSamSegmentationProvider()]; }
    if (selection === 'efficientsam') { return [new EfficientSamSegmentationProvider()]; }
    try { return [resolveSegmentationProvider({ provider: selection, profile }).used]; }
    catch { return [new FastSamSegmentationProvider()]; }
}

function resolveAutoProvider(providers: SegmentationProvider[], profile: SegmentationProcessingProfile): SegmentationProvider | undefined {
    const preferredId = profile === 'accurate' ? 'efficientsam' : 'fastsam';
    return providers.find((provider) => provider.id === preferredId && provider.isAvailable()) ?? providers.find((provider) => provider.id === 'fastsam' && provider.isAvailable());
}

function resolveRequestedProvider(providers: SegmentationProvider[], requested: SegmentationProviderSelection): SegmentationProvider | undefined {
    return providers.find((provider) => provider.id === requested && provider.isAvailable());
}

export function resolveSegmentationProvider(input: { provider?: SegmentationProviderSelection; profile?: SegmentationProcessingProfile; providers?: SegmentationProvider[] }): SegmentationResolution {
    const providers = input.providers ?? defaultProviders();
    const requested = input.provider ?? 'auto';
    const profile = input.profile ?? 'fast';
    const used = requested === 'auto' ? resolveAutoProvider(providers, profile) : resolveRequestedProvider(providers, requested);
    if (!used) {throw new Error(`No verified segmentation provider is available for ${requested}. Open Model Manager or install the requested model.`);}
    return { requested, used };
}
