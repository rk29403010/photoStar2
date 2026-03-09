import type { WebSocket } from 'ws';
import type { DatabaseManager } from '../db';
import type { EventBus } from '../events/bus';
import type { Coordinator } from '../coordinator';

export interface CommandContext {
    id: string;
    command: string;
    payload?: unknown;
    originWs?: WebSocket;
    dbManager: DatabaseManager;
    eventBus: EventBus;
    coordinator: Coordinator;
    activeJobs: Map<string, AbortController>;
    LIB_DIR: string;
    respond: (id: string, status: 'ok' | 'error' | 'event', data: unknown, error: string | null, targetWs?: WebSocket) => void;
}

export type CommandHandler = (ctx: CommandContext) => void | Promise<void>;
export type CommandHandlerMap = Record<string, CommandHandler>;
