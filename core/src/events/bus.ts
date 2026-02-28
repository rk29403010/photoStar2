import { DatabaseManager } from '../db';
import { DomainEvent } from './types';
import { v4 as uuidv4 } from 'uuid';

type EventHandler = (event: DomainEvent) => void;

export class EventBus {
    private handlers: Map<string, EventHandler[]> = new Map();
    private db: DatabaseManager;

    constructor(db: DatabaseManager) {
        this.db = db;
    }

    public subscribe(type: DomainEvent['type'], handler: EventHandler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, []);
        }
        this.handlers.get(type)!.push(handler);
    }

    public emit(event: DomainEvent) {
        // console.error(`[EventBus] Emitting ${event.type}`);
        // 1. Persist
        try {
            this.db.getDb().prepare(
                'INSERT INTO events (id, type, payload, created_at) VALUES (?, ?, ?, ?)'
            ).run(
                uuidv4(),
                event.type,
                JSON.stringify(event), // Payload is the whole event for simplicity in this implementation
                new Date().toISOString()
            );
        } catch (e) {
            console.error('Failed to persist event:', e);
        }

        // 2. Dispatch
        const specificHandlers = this.handlers.get(event.type) || [];
        specificHandlers.forEach(h => {
            try {
                h(event);
            } catch (e) {
                console.error(`Error in event handler for ${event.type}:`, e);
            }
        });

        // 3. Global handlers (wildcard)
        const globalHandlers = this.handlers.get('*') || [];
        globalHandlers.forEach(h => {
            try {
                h(event);
            } catch (e) {
                console.error(`Error in global event handler:`, e);
            }
        });
    }

    public subscribeAll(handler: EventHandler) {
        if (!this.handlers.has('*')) {
            this.handlers.set('*', []);
        }
        this.handlers.get('*')!.push(handler);
    }
}
