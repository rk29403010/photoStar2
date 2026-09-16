import { createContext, useContext } from 'react';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';

export type SinglePhotoRelationshipContextValue = {
    presentation: LibraryPresentationItem | null;
};

export const SinglePhotoRelationshipContext = createContext<SinglePhotoRelationshipContextValue>({
    presentation: null,
});

export function useSinglePhotoRelationship(): SinglePhotoRelationshipContextValue {
    return useContext(SinglePhotoRelationshipContext);
}
