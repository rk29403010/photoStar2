import { createContext, useContext, type ReactNode } from 'react';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';

type SinglePhotoRelationshipContextValue = {
    presentation: LibraryPresentationItem;
};

const SinglePhotoRelationshipContext = createContext<SinglePhotoRelationshipContextValue | null>(null);

export function SinglePhotoRelationshipProvider(props: {
    readonly presentation: LibraryPresentationItem | null;
    readonly children: ReactNode;
}) {
    if (!props.presentation) {
        return props.children;
    }

    return (
        <SinglePhotoRelationshipContext.Provider value={{ presentation: props.presentation }}>
            {props.children}
        </SinglePhotoRelationshipContext.Provider>
    );
}

export function useSinglePhotoRelationship() {
    return useContext(SinglePhotoRelationshipContext);
}
