
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { DatabaseManager } from '../../data/db';
import { handleSystemCommand } from '../../services/handlers';
import { EventBus } from '../../services/events/bus';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { DomainEvent } from '../../services/events/types';
import { startDevBridgeServer } from '../../boundary/transport/devBridgeServer';
import {
    runAutoScanWorker,
    runPreviewWorker,
} from '../../services/runtimeWorkers';
import { createPreviewAdapterModule } from '../../services/workflowRuntime/modules/previewAdapterModule';
import { createDetectFacesModule } from '../../services/workflowRuntime/modules/detectFacesModule';
import { createDetectSensitiveContentModule } from '../../services/workflowRuntime/modules/detectSensitiveContentModule';
import { createGenerateAiMetadataModule } from '../../services/workflowRuntime/modules/generateAiMetadataModule';
import { createGenerateFaceVectorsModule } from '../../services/workflowRuntime/modules/generateFaceVectorsModule';
import { createGeneratePreviewsModule } from '../../services/workflowRuntime/modules/generatePreviewsModule';
import { createGroupSimilarPhotosModule } from '../../services/workflowRuntime/modules/groupSimilarPhotosModule';
import { assetPreviewWorkflowDefinition } from '../../services/workflowRuntime/workflows/assetPreviewWorkflow';
import { createResolvePeopleModule } from '../../services/workflowRuntime/modules/resolvePeopleModule';
import { createScanFolderModule } from '../../services/workflowRuntime/modules/scanFolderModule';
import { libraryAiMetadataWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryAiMetadataWorkflow';
import { libraryFaceWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryFaceWorkflow';
import { folderIngestWorkflowDefinition } from '../../services/workflowRuntime/workflows/folderIngestWorkflow';
import { libraryGroupingWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryGroupingWorkflow';
import { libraryPreviewWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryPreviewWorkflow';
import { librarySensitiveScanWorkflowDefinition } from '../../services/workflowRuntime/workflows/librarySensitiveScanWorkflow';
import { ExecutionStore } from '../../services/workflowRuntime/executionStore';
import { ModuleRegistry } from '../../services/workflowRuntime/moduleRegistry';
import { SubjectRegistry } from '../../services/workflowRuntime/subjectRegistry';
import { WorkflowRegistry } from '../../services/workflowRuntime/workflowRegistry';
import { WorkflowRuntimeOrchestrator } from '../../services/workflowRuntime/orchestrator';

process.on('uncaughtException', (_err) => {
    console.error('[CRITICAL] Uncaught Exception:', _err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Constants
const APP_DATA_DIR = process.env.APPDATA || process.env.HOME || '.';
const LIB_DIR = join(APP_DATA_DIR, 'PhotoLibraryDesktop');

if (!existsSync(LIB_DIR)) {
    mkdirSync(LIB_DIR, { recursive: true });
}

console.log(`Core backend service started. Storage: ${LIB_DIR}`);

const dbManager = new DatabaseManager(LIB_DIR);
const eventBus = new EventBus(dbManager);
const workflowRuntimeStore = new ExecutionStore(dbManager);
const workflowRuntimeSubjects = new SubjectRegistry();
const workflowRuntimeModules = new ModuleRegistry();
const workflowRuntimeWorkflows = new WorkflowRegistry({
    subjects: workflowRuntimeSubjects,
    modules: workflowRuntimeModules,
});

workflowRuntimeSubjects.register({
    id: 'folder',
    version: 1,
    durable: false,
    summary: { titleField: 'path', thumbnailStrategy: 'none' },
    progressSemantics: 'aggregate',
    relations: [],
    ui: { detailSections: ['overview'] },
    labels: { singular: 'folder', plural: 'folders' },
});
workflowRuntimeSubjects.register({
    id: 'asset',
    version: 1,
    durable: true,
    summary: { titleField: 'id', thumbnailStrategy: 'asset' },
    progressSemantics: 'per_subject',
    relations: [],
    ui: { detailSections: ['overview'] },
    labels: { singular: 'file', plural: 'files' },
});
workflowRuntimeModules.register(createScanFolderModule({ dbManager }));
workflowRuntimeModules.register(createGeneratePreviewsModule({ dbManager, eventBus }));
workflowRuntimeModules.register(createDetectFacesModule({ dbManager, eventBus }));
workflowRuntimeModules.register(createGenerateFaceVectorsModule({ dbManager }));
workflowRuntimeModules.register(createResolvePeopleModule({ dbManager }));
workflowRuntimeModules.register(createGroupSimilarPhotosModule({ dbManager }));
workflowRuntimeModules.register(createDetectSensitiveContentModule({ dbManager, eventBus }));
workflowRuntimeModules.register(createGenerateAiMetadataModule({ dbManager, eventBus }));
workflowRuntimeModules.register(createPreviewAdapterModule({
    runPreview: async (mediaIds) => {
        await runPreviewWorker(mediaIds, { dbManager, eventBus });
    },
}));
workflowRuntimeWorkflows.register(folderIngestWorkflowDefinition);
workflowRuntimeWorkflows.register(libraryGroupingWorkflowDefinition);
workflowRuntimeWorkflows.register(assetPreviewWorkflowDefinition);
workflowRuntimeWorkflows.register(libraryPreviewWorkflowDefinition);
workflowRuntimeWorkflows.register(libraryFaceWorkflowDefinition);
workflowRuntimeWorkflows.register(librarySensitiveScanWorkflowDefinition);
workflowRuntimeWorkflows.register(libraryAiMetadataWorkflowDefinition);
const workflowRuntime = {
    store: workflowRuntimeStore,
    workflows: workflowRuntimeWorkflows,
    orchestrator: new WorkflowRuntimeOrchestrator({
        store: workflowRuntimeStore,
        workflows: workflowRuntimeWorkflows,
        modules: workflowRuntimeModules,
    }),
};

// Apply system_log_level to suppress noisy info logs in production modes
const logLevel = dbManager.getSetting('system_log_level') || 'info';
if (logLevel === 'warn' || logLevel === 'error') {
    // Suppress console.log (info-level) messages; console.error still flows for critical output
    console.log = () => { /* silenced */ };
}

// workflow_auto_scan: if set to 'last_folder', re-scan the most recently used folder on startup
const autoScan = dbManager.getSetting('workflow_auto_scan');
if (autoScan === 'last_folder') {
    const db = dbManager.getDb();
    const lastFolder = db.prepare('SELECT path FROM folder_history ORDER BY last_scanned_at DESC LIMIT 1').get() as { path: string } | undefined;
    if (lastFolder?.path) {
        console.error(`[Startup] Auto-scan enabled. Resuming scan of: ${lastFolder.path}`);
        // Defer slightly so all subscribers are registered first
        setTimeout(() => {
            eventBus.emit({ type: 'FolderScanRequested', folderId: lastFolder.path, scanSessionId: 'startup-autoscan' });
            runAutoScanWorker('startup-autoscan', lastFolder.path, { dbManager, eventBus })
                .catch(err => console.error('[Startup] Auto-scan failed:', err));
        }, 1500);
    }
}

function persistJobStarted(event: Extract<DomainEvent, { type: 'JobStarted' }>) {
    const db = dbManager.getDb();
    db.prepare(`
        INSERT OR REPLACE INTO jobs (id, stage, status, started_at, created_at, total_items, last_error)
        VALUES (?, ?, 'running', ?, ?, ?, NULL)
    `).run(event.jobId, event.pipelineStage, new Date().toISOString(), new Date().toISOString(), event.totalItems || 0);
}

function persistJobProgress(event: Extract<DomainEvent, { type: 'JobProgress' }>) {
    const db = dbManager.getDb();
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
    const db = dbManager.getDb();
    db.prepare("UPDATE jobs SET status = 'completed', finished_at = ?, last_error = NULL WHERE id = ?")
        .run(new Date().toISOString(), event.jobId);
}

function persistJobFailed(event: Extract<DomainEvent, { type: 'JobFailed' }>) {
    const db = dbManager.getDb();
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

// Wiring: Forward all events to frontend and persist job status
eventBus.subscribeAll(handleBroadcastEvent);

// Periodic Cleanup: Keep 30 days of history
function performCleanup() {
    console.log('[Cleanup] Running periodic cleanup of old jobs and events (30 day retention)');
    try {
        const db = dbManager.getDb();
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
    preview_path: string | null;
    faces_data: string | null;
    rec_data: string | null;
    people_data: string | null;
    ai_metadata_data: string | null;
    sensitivity_score: number | null;
    sensitivity_status: string | null;
};

function loadUpdatedAssetRow(assetId: string): AssetUpdatedRow | undefined {
    const db = dbManager.getDb();
    return db.prepare(`
        SELECT a.id, a.original_path, a.width, a.height, a.created_at,
               a.sensitivity_score,
               am.sensitivity_status,
               p.path as preview_path,
               dr.data as faces_data,
               fr.data as rec_data,
               aim.data as ai_metadata_data,
               (
                   SELECT json_group_array(json_object('face_index', fa.face_index, 'person_id', fa.person_id, 'name', per.name))
                   FROM face_assignments fa
                   JOIN people per ON fa.person_id = per.id
                   WHERE fa.asset_id = a.id
               ) as people_data
        FROM assets a
        LEFT JOIN previews p ON a.id = p.asset_id AND p.size = 'thumbnail'
        LEFT JOIN derived_results dr ON a.id = dr.asset_id AND dr.task = 'face_detection'
        LEFT JOIN derived_results fr ON a.id = fr.asset_id AND fr.task = 'face_recognition'
        LEFT JOIN derived_results aim ON a.id = aim.asset_id AND aim.task = 'ai_metadata'
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

    return {
        ...row,
        faces,
        face_embeddings: row.rec_data ? JSON.parse(row.rec_data).embeddings : [],
        ai_metadata: aiMeta,
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

// 8. Asset Updated — re-query the asset and push to frontend so UI reflects new metadata
eventBus.subscribe('AssetUpdated', handleAssetUpdatedEvent);

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

function handleMessage(msg: { id: string, command: string, payload?: unknown }, originWs?: WebSocket) {
    const { id, command, payload } = msg;
    try {

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
        performCleanup();
        setInterval(performCleanup, 24 * 60 * 60 * 1000);
    },
});
