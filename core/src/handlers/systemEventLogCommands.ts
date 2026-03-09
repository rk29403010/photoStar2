import type { CommandHandlerMap } from './types';
import { summarizeForEventLog } from '../../../shared/utils/eventLogSummary';

type EventRow = { id: string; type: string; payload: string; created_at: string };

type DbLike = {
    prepare: (sql: string) => {
        get: (...args: unknown[]) => unknown;
        all: (...args: unknown[]) => unknown[];
    };
};

function asDbLike(db: unknown): DbLike {
    return db as DbLike;
}

export function getRecentEventsSnapshot(db: unknown) {
    const typedDb = asDbLike(db);
    const rows = typedDb.prepare(`
        SELECT id, type, payload, created_at
        FROM events
        ORDER BY created_at DESC
        LIMIT 100
    `).all() as EventRow[];

    return rows.map((row) => {
        let parsedPayload: unknown = row.payload;
        try {
            parsedPayload = JSON.parse(row.payload);
        } catch {
            // keep raw payload string if parsing fails
        }

        return {
            id: row.id,
            type: row.type,
            createdAt: row.created_at,
            payload: summarizeForEventLog(parsedPayload),
        };
    });
}

function getEventRow(db: unknown, eventId: string): EventRow | undefined {
    const typedDb = asDbLike(db);
    return typedDb.prepare(`
        SELECT id, type, payload, created_at
        FROM events
        WHERE id = ?
        LIMIT 1
    `).get(eventId) as EventRow | undefined;
}

export const systemEventLogCommandHandlers: CommandHandlerMap = {
    get_event_payload: (ctx) => {
        const { id, originWs, dbManager, respond, payload } = ctx;
        try {
            const eventId = String((payload as { eventId?: string } | undefined)?.eventId || '').trim();
            if (!eventId) {
                respond(id, 'error', null, 'eventId is required', originWs);
                return;
            }

            const row = getEventRow(dbManager.getDb(), eventId);
            if (!row) {
                respond(id, 'error', null, `Event not found: ${eventId}`, originWs);
                return;
            }

            respond(id, 'ok', {
                id: row.id,
                type: row.type,
                createdAt: row.created_at,
                payloadJson: row.payload,
            }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },
};
