import type { LibraryPresentationExpansion } from '@contracts/libraryPresentation';
import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import type { RefreshLibraryOptions } from '@ui/hooks/usePhotoLibrary.gallery';

type LibraryPresentationActionParams = {
    request: RequestFn;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
};

export function createLibraryPresentationActions(params: LibraryPresentationActionParams) {
    const { request, refreshLibrary } = params;

    return {
        getPresentationExpansion: (presentationKey: string): Promise<LibraryPresentationExpansion> => request({
            idPrefix: `get_presentation_expansion_${presentationKey}`,
            command: 'get_library_presentation_expansion',
            payload: { presentationKey },
            select: (data) => data?.expansion as LibraryPresentationExpansion,
        }),
        setPresentationCover: async (presentationKey: string, assetId: string): Promise<void> => {
            await request<void>({
                idPrefix: 'set_library_presentation_cover',
                command: 'set_library_presentation_cover',
                payload: { presentationKey, assetId },
                select: () => undefined,
            });
            refreshLibrary({ preservePagingState: true });
        },
        setPresentationShowSeparately: async (
            presentationKey: string,
            showSeparately = true,
        ): Promise<void> => {
            await request<void>({
                idPrefix: 'set_library_presentation_show_separately',
                command: 'set_library_presentation_show_separately',
                payload: { presentationKey, showSeparately },
                select: () => undefined,
            });
            refreshLibrary({ preservePagingState: true });
        },
    };
}
