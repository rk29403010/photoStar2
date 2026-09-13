import type { ReactNode } from 'react';
import type { LibraryPresentationItem } from '@contracts/libraryPresentation';
import { SinglePhotoRelationshipContext } from './singlePhotoRelationshipState';

export function SinglePhotoRelationshipProvider(props: {
    readonly presentation: LibraryPresentationItem | null;
    readonly children: ReactNode;
}) {
    return (
        <SinglePhotoRelationshipContext.Provider value={{ presentation: props.presentation }}>
            {props.children}
        </SinglePhotoRelationshipContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components -- compatibility re-export while relationship consumers migrate.
export { useSinglePhotoRelationship } from './singlePhotoRelationshipState';
