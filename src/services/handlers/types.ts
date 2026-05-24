import type { WebSocket } from 'ws';
import type { DatabaseManager } from '../../data/db';
import type { EventBus } from '../events/bus';
import type { ExecutionStore } from '../workflowRuntime/executionStore';
import type { WorkflowRuntimeOrchestrator } from '../workflowRuntime/orchestrator';
import type { WorkflowRegistry } from '../workflowRuntime/workflowRegistry';
import type { ModuleRegistry } from '../workflowRuntime/moduleRegistry';

export type WorkflowRuntimeFacade = {
    store: ExecutionStore;
    orchestrator: WorkflowRuntimeOrchestrator;
    workflows: WorkflowRegistry;
    modules: ModuleRegistry;
}

export type CommandContext = {
    id: string;
    command: string;
    payload?: unknown;
    originWs?: WebSocket;
    dbManager: DatabaseManager;
    eventBus: EventBus;
    activeJobs: Map<string, AbortController>;
    LIB_DIR: string;
    workflowRuntime?: WorkflowRuntimeFacade;
    respond: (id: string, status: 'ok' | 'error' | 'event', data: unknown, error: string | null, targetWs?: WebSocket) => void;
}

export type CommandHandler = (ctx: CommandContext) => void | Promise<void>;
export type CommandHandlerMap = Record<string, CommandHandler>;
