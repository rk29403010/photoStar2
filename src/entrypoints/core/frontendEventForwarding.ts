import type { DomainEvent } from '../../services/events/types';

export function shouldForwardEventToFrontend(event: DomainEvent): boolean {
    return event.type !== 'AssetUpdated';
}
