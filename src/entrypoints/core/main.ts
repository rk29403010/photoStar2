
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { DatabaseManager } from '../../data/db';
import { handleSystemCommand } from '../../services/handlers';
import { EventBus } from '../../services/events/bus';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { DomainEvent } from '../../services/events/types';
import { startDevBridgeServer } from '../../boundary/transport/devBridgeServer';
import type { ExecutionStore } from '../../services/workflowRuntime/executionStore';
import type { WorkflowRegistry } from '../../services/workflowRuntime/workflowRegistry';
import type { WorkflowRuntimeOrchestrator } from '../../services/workflowRuntime/orchestrator';
import { buildLatestDerivedResultJoin } from '../../shared/sql/derivedResults';
import { loadLocalEnvFile } from './loadLocalEnv';
import {
    buildStartupFailureMessage,
    isFactoryResetCommand,
    resetLibraryStorageFiles,
} from './startupRecovery';
import {
    applyConfiguredLogLevel,
    createWorkflowRuntimeBundle,
    resumeAutoScanIfNeeded,
} from './runtimeBootstrap';

process.on('uncaughtException', (_err) => {
    console.error('[CRITICAL] Uncaught Exception:', _err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

loadLocalEnvFile();

// Constants
const APP_DATA_DIR = process.env.APPDATA || process.env.HOME || '.';
const LIB_DIR = join(APP_DATA_DIR, 'PhotoLibraryDesktop');

if (!existsSync(LIB_DIR)) {
    mkdirSync(LIB_DIR, { recursive: true });
}

console.log(`Core backend service started. Storage: ${LIB_DIR}`);

let dbManager: DatabaseManager | null = null;
let eventBus: EventBus | null = null;
let workflowRuntime: {
    store: ExecutionStore;
    workflows: WorkflowRegistry;
    orchestrator: WorkflowRuntimeOrchestrator;
} | null = null;
let startupError: Error | null = null;

function initialiseCoreServices() {
    const nextDbManager = new DatabaseManager(LIB_DIR);
    const nextEventBus = new EventBus(nextDbManager);
    const nextWorkflowRuntime = createWorkflowRuntimeBundle(nextDbManager, nextEventBus);

    nextEventBus.subscribeAll(handleBroadcastEvent);
    nextEventBus.subscribe('AssetUpdated', handleAssetUpdatedEvent);

    dbManager = nextDbManager;
    eventBus = nextEventBus;
    workflowRuntime = nextWorkflowRuntime;
    startupError = null;
    applyConfiguredLogLevel(nextDbManager);
    resumeAutoScanIfNeeded(nextDbManager, nextEventBus);
}

function bootstrapCoreServices() {
    try {
        initialiseCoreServices();
    } catch (error) {
        startupError = error instanceof Error ? error : new Error(String(error));
        console.error('[Startup] Core services failed to initialise:', startupError);
    }
}

function persistJobStarted(event: Extract<DomainEvent, { type: 'JobStarted' }>) {
    const db = dbManager?.getDb();
    if (!db) {return;}
    db.prepare(`
        INSERT OR REPLACE INTO jobs (id, stage, status, started_at, created_at, total_items, last_error)
        VALUES (?, ?, 'running', ?, ?, ?, NULL)
    `).run(event.jobId, event.pipelineStage, new Date().toISOString(), new Date().toISOString(), event.totalItems || 0);
}

function persistJobProgress(event: Extract<DomainEvent, { type: 'JobProgress' }>) {
    const db = dbManager?.getDb();
    if (!db) {return;}
    db.prepare(`
        UPDATE jobs SET 
            processed_items = ?, 
            total_items = ?, 
            current_item_path = ?, 
            throughput_ips = ?, 
            error_count = ?,
            status = 'running'
        WHERE id = ?
    `).run(
        event.processedItems,
        event.totalItems || 0,
        event.currentItemPath || null,
        event.throughputIps || 0,
        event.errorCount || 0,
        event.jobId
    );
}

function persistJobCompleted(event: Extract<DomainEvent, { type: 'JobCompleted' }>) {
    const db = dbManager?.getDb();
    if (!db) {return;}
    db.prepare("UPDATE jobs SET status = 'completed', finished_at = ?, last_error = NULL WHERE id = ?")
        .run(new Date().toISOString(), event.jobId);
}

function persistJobFailed(event: Extract<DomainEvent, { type: 'JobFailed' }>) {
    const db = dbManager?.getDb();
    if (!db) {return;}
    db.prepare(`
        UPDATE jobs
        SET status = 'failed',
            finished_at = ?,
            last_error = ?,
            error_count = COALESCE(error_count, 0) + 1
        WHERE id = ?
    `).run(new Date().toISOString(), event.reason, event.jobId);
}

function persistJobEvent(event: DomainEvent) {
    if (event.type === 'JobStarted') {
        persistJobStarted(event);
        return;
    }

    if (event.type === 'JobProgress') {
        persistJobProgress(event);
        return;
    }

    if (event.type === 'JobCompleted') {
        persistJobCompleted(event);
        return;
    }

    if (event.type === 'JobFailed') {
        persistJobFailed(event);
    }
}

function forwardEventToFrontend(event: DomainEvent) {
    respond('event_stream', 'event', event);
}

function handleBroadcastEvent(event: DomainEvent) {
    try {
        persistJobEvent(event);
    } catch (_err) {
        console.error('Failed to persist job event:', _err);
    }

    forwardEventToFrontend(event);
}

// Periodic Cleanup: Keep 30 days of history
function performCleanup() {
    console.log('[Cleanup] Running periodic cleanup of old jobs and events (30 day retention)');
    try {
        const db = dbManager?.getDb();
        if (!db) {return;}
        // Delete jobs older than 30 days
        const jobResult = db.prepare("DELETE FROM jobs WHERE created_at < date('now', '-30 days')").run();
        // Delete events older than 30 days
        const eventResult = db.prepare("DELETE FROM events WHERE created_at < date('now', '-30 days')").run();
        // Delete issues older than 30 days? Maybe keep fatal ones longer? 
        // For now let's just clean them too.
        const issueResult = db.prepare("DELETE FROM processing_issues WHERE created_at < date('now', '-30 days')").run();

        console.log(`[Cleanup] Removed ${jobResult.changes} old jobs, ${eventResult.changes} events, ${issueResult.changes} issues.`);
    } catch (_err) {
        console.error('[Cleanup] Failed:', _err);
    }
}

type AssetUpdatedRow = {
    id: string;
    original_path: string;
    width: number;
    height: number;
    created_at: string;
    photo_created_at: string | null;
    photo_created_at_confidence: number | null;
    exif_datetime: string | null;
    metadata_timestamp_source: string | null;
    preview_path: string | null;
    faces_data: string | null;
    rec_data: string | null;
    people_data: string | null;
    ai_metadata_data: string | null;
    embedded_metadata_data: string | null;
    sensitivity_score: number | null;
    sensitivity_status: string | null;
};

function loadUpdatedAssetRow(assetId: string): AssetUpdatedRow | undefined {
    const db = dbManager?.getDb();
    if (!db) {return undefined;}
    return db.prepare(`
        SELECT a.id, a.original_path, a.width, a.height, a.created_at, a.photo_created_at, a.photo_created_at_confidence, a.exif_datetime, a.metadata_timestamp_source,
               a.sensitivity_score,
               am.sensitivity_status,
               p.path as preview_path,
               dr.data as faces_data,
               fr.data as rec_data,
               aim.data as ai_metadata_data,
               meta.data as embedded_metadata_data,
               (
                   SELECT json_group_array(json_object('face_index', fa.face_index, 'person_id', fa.person_id, 'name', per.name))
                   FROM face_assignments fa
                   JOIN people per ON fa.person_id = per.id
                   WHERE fa.asset_id = a.id
               ) as people_data
        FROM assets a
        LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'dr', task: 'face_detection' })}
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'fr', task: 'face_recognition' })}
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'aim', task: 'ai_metadata' })}
        ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'meta', task: 'embedded_metadata' })}
        LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
        LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
        WHERE a.id = ?
    `).get(assetId) as AssetUpdatedRow | undefined;
}

function mergeFaceAssignments(row: AssetUpdatedRow) {
    const faces = row.faces_data ? JSON.parse(row.faces_data).faces || [] : [];
    const peopleData = row.people_data ? JSON.parse(row.people_data) : [];

    faces.forEach((face: { person_id?: string; person_name?: string }, index: number) => {
        const assignment = peopleData.find((person: { face_index: number; person_id: string; name: string }) => person.face_index === index);
        if (assignment) {
            face.person_id = assignment.person_id;
            face.person_name = assignment.name;
        }
    });

    return faces;
}

function buildUpdatedAsset(row: AssetUpdatedRow) {
    const faces = mergeFaceAssignments(row);
    const aiMeta = row.ai_metadata_data ? JSON.parse(row.ai_metadata_data) : undefined;
    const embeddedMetadata = row.embedded_metadata_data ? JSON.parse(row.embedded_metadata_data) : undefined;

    return {
        ...row,
        faces,
        face_embeddings: row.rec_data ? JSON.parse(row.rec_data).embeddings : [],
        ai_metadata: aiMeta,
        embedded_metadata: embeddedMetadata,
        caption: aiMeta?.caption || undefined
    };
}

function handleAssetUpdatedEvent(event: DomainEvent) {
    if (event.type !== 'AssetUpdated') {return;}

    try {
        const row = loadUpdatedAssetRow(event.assetId);
        if (!row) {return;}

        const asset = buildUpdatedAsset(row);
        respond('event_stream', 'event', { type: 'AssetUpdated', asset });
        console.log(`[AssetUpdated] Pushed refreshed asset \${event.assetId} to frontend`);
    } catch (err) {
        console.error('[AssetUpdated] Failed to re-query asset:', err);
    }
}

// Define the schema for incoming WebSocket commands
const WsCommandSchema = z.object({
    id: z.string(),
    command: z.string(),
    payload: z.any().optional(),
});

let buffer = '';

function handleIncomingLine(line: string, originWs?: WebSocket) {
    try {
        const rawMsg = JSON.parse(line);
        const msg = WsCommandSchema.parse(rawMsg);
        handleMessage(msg, originWs);
    } catch (_err) {
        console.error('[DEBUG] Failed to parse message:', line, _err);
    }
}

process.stdin.on('data', (chunk) => {
    buffer += chunk.toString();

    let lineEndIndex;
    while ((lineEndIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineEndIndex).trim();
        buffer = buffer.slice(lineEndIndex + 1);

        if (!line) {continue;}
        handleIncomingLine(line);
    }
});

// Track active jobs (Legacy support + Scan cancellation)
const activeJobs = new Map<string, AbortController>();

function recoverFromStartupFailure(): string {
    resetLibraryStorageFiles(LIB_DIR);
    bootstrapCoreServices();
    if (startupError) {
        throw startupError;
    }
    return 'Factory reset complete. Backend recovered after startup failure.';
}

function handleMessage(msg: { id: string, command: string, payload?: unknown }, originWs?: WebSocket) {
    const { id, command, payload } = msg;
    try {
        if (startupError) {
            if (isFactoryResetCommand(command, payload)) {
                const message = recoverFromStartupFailure();
                respond(id, 'ok', { message, mode: 'factory' }, null, originWs);
                respond('event_stream', 'event', { type: 'BackendRecovered', message }, null, originWs);
                return;
            }

            respond(id, 'error', null, buildStartupFailureMessage(startupError, LIB_DIR), originWs);
            return;
        }

        if (!dbManager || !eventBus || !workflowRuntime) {
            respond(id, 'error', null, `Backend is unavailable for storage '${LIB_DIR}'.`, originWs);
            return;
        }

        handleSystemCommand({
            id,
            command,
            payload,
            originWs,
            dbManager,
            eventBus,
            activeJobs,
            LIB_DIR,
            workflowRuntime,
            respond
        });
    } catch (err: unknown) {
        respond(id, 'error', null, err instanceof Error ? err.message : String(err), originWs);
    }
}

const { respond } = startDevBridgeServer({
    onMessage: handleIncomingLine,
    onReady: () => {
        if (startupError) {
            respond('event_stream', 'event', {
                type: 'BackendStartupFailed',
                message: buildStartupFailureMessage(startupError, LIB_DIR),
            }, null);
            return;
        }

        performCleanup();
        setInterval(performCleanup, 24 * 60 * 60 * 1000);
    },
});

bootstrapCoreServices();
