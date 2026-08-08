import type { EventBus } from '../../services/events/bus';
import { assetPreviewWorkflowDefinition } from '../../services/workflowRuntime/workflows/assetPreviewWorkflow';
import { libraryAiMetadataWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryAiMetadataWorkflow';
import { libraryFaceWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryFaceWorkflow';
import { libraryPhotoDateWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryPhotoDateWorkflow';
import { folderIngestWorkflowDefinition } from '../../services/workflowRuntime/workflows/folderIngestWorkflow';
import { simulationWorkflowDefinition } from '../../services/workflowRuntime/workflows/simulationWorkflow';
import { libraryGroupingWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryGroupingWorkflow';
import { libraryPreviewWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryPreviewWorkflow';
import { librarySensitiveScanWorkflowDefinition } from '../../services/workflowRuntime/workflows/librarySensitiveScanWorkflow';
import { selectedSubjectMetadataWorkflowDefinition } from '../../services/workflowRuntime/workflows/selectedSubjectMetadataWorkflow';
import { editorMasksWorkflowDefinition } from '../../services/workflowRuntime/workflows/editorMasksWorkflow';
import { detectFramesWorkflowDefinition } from '../../services/workflowRuntime/workflows/detectFramesWorkflow';
import { ExecutionStore } from '../../services/workflowRuntime/executionStore';
import { ModuleRegistry } from '../../services/workflowRuntime/moduleRegistry';
import { SubjectRegistry } from '../../services/workflowRuntime/subjectRegistry';
import { WorkflowRuntimeTelemetry } from '../../services/workflowRuntime/telemetry';
import { WorkflowRegistry } from '../../services/workflowRuntime/workflowRegistry';
import { WorkflowRuntimeOrchestrator } from '../../services/workflowRuntime/orchestrator';
import { runAutoScanWorker, runPreviewWorker } from '../../services/runtimeWorkers';
import type { DatabaseManager } from '../../data/db';
import { generatedWorkflowModulePlugins } from '../../services/workflowRuntime/generatedModulePluginRegistry';
import { registerWorkflowModulePlugins } from '../../services/workflowRuntime/modulePluginHost';

type WorkflowRuntimeBundle = {
    store: ExecutionStore;
    workflows: WorkflowRegistry;
    orchestrator: WorkflowRuntimeOrchestrator;
    modules: ModuleRegistry;
};

function createConsoleWorkflowTelemetry(): WorkflowRuntimeTelemetry {
    return new WorkflowRuntimeTelemetry({
        emit(event) {
            if (event.type === 'RunStarted') {
                console.log(`[Workflow] Started ${String(event.workflowId)} run ${String(event.runId)}`);
                return;
            }

            if (event.type === 'RunCompleted') {
                console.log(`[Workflow] Completed ${String(event.workflowId)} run ${String(event.runId)}`);
                return;
            }

            if (event.type === 'RunFailed') {
                console.error(
                    `[Workflow] Failed ${String(event.workflowId)} run ${String(event.runId)}: ${String(event.errorMessage)}`,
                );
            }
        },
    });
}

function registerSubjects(subjects: SubjectRegistry) {
    subjects.register({
        id: 'folder',
        version: 1,
        durable: false,
        summary: { titleField: 'path', thumbnailStrategy: 'none' },
        progressSemantics: 'aggregate',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'folder', plural: 'folders' },
    });
    subjects.register({
        id: 'asset',
        version: 1,
        durable: true,
        summary: { titleField: 'id', thumbnailStrategy: 'asset' },
        progressSemantics: 'per_subject',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'file', plural: 'files' },
    });
    subjects.register({
        id: 'selection',
        version: 1,
        durable: false,
        summary: { titleField: 'id', thumbnailStrategy: 'none' },
        progressSemantics: 'aggregate',
        relations: [],
        ui: { detailSections: ['overview'] },
        labels: { singular: 'selection', plural: 'selections' },
    });
}

function registerModules(modules: ModuleRegistry, dbManager: DatabaseManager, eventBus: EventBus) {
    registerWorkflowModulePlugins(modules, generatedWorkflowModulePlugins, {
        dbManager,
        eventBus,
        runPreview: async (mediaIds) => {
            await runPreviewWorker(mediaIds, { dbManager, eventBus });
        },
    });
}

function registerWorkflows(workflows: WorkflowRegistry) {
    workflows.register(folderIngestWorkflowDefinition);
    workflows.register(simulationWorkflowDefinition);
    workflows.register(libraryGroupingWorkflowDefinition);
    workflows.register(assetPreviewWorkflowDefinition);
    workflows.register(libraryPreviewWorkflowDefinition);
    workflows.register(libraryFaceWorkflowDefinition);
    workflows.register(librarySensitiveScanWorkflowDefinition);
    workflows.register(libraryAiMetadataWorkflowDefinition);
    workflows.register(libraryPhotoDateWorkflowDefinition);
    workflows.register(selectedSubjectMetadataWorkflowDefinition);
    workflows.register(editorMasksWorkflowDefinition);
    workflows.register(detectFramesWorkflowDefinition);
}

export function createWorkflowRuntimeBundle(dbManager: DatabaseManager, eventBus: EventBus): WorkflowRuntimeBundle {
    const store = new ExecutionStore(dbManager);
    const subjects = new SubjectRegistry();
    const modules = new ModuleRegistry();
    const workflows = new WorkflowRegistry({ subjects, modules });

    registerSubjects(subjects);
    registerModules(modules, dbManager, eventBus);
    registerWorkflows(workflows);

    return {
        store,
        workflows,
        modules,
        orchestrator: new WorkflowRuntimeOrchestrator({
            store,
            workflows,
            modules,
            telemetry: createConsoleWorkflowTelemetry(),
        }),
    };
}

export function applyConfiguredLogLevel(dbManager: DatabaseManager) {
    const logLevel = dbManager.getSetting('system_log_level') || 'info';
    if (logLevel === 'warn' || logLevel === 'error') {
        console.log = () => { /* silenced */ };
    }
}

export function resumeAutoScanIfNeeded(dbManager: DatabaseManager, eventBus: EventBus) {
    if (dbManager.getSetting('workflow_auto_scan') !== 'last_folder') {
        return;
    }

    const db = dbManager.getDb();
    const lastFolder = db.prepare('SELECT path FROM folder_history ORDER BY last_scanned_at DESC LIMIT 1').get() as { path: string } | undefined;
    if (!lastFolder?.path) {
        return;
    }

    console.error(`[Startup] Auto-scan enabled. Resuming scan of: ${lastFolder.path}`);
    setTimeout(() => {
        eventBus.emit({ type: 'FolderScanRequested', folderId: lastFolder.path, scanSessionId: 'startup-autoscan' });
        runAutoScanWorker('startup-autoscan', lastFolder.path, { dbManager, eventBus })
            .catch((error) => console.error('[Startup] Auto-scan failed:', error));
    }, 1500);
}
