import type { EventBus } from '../../services/events/bus';
import { createDetectFacesModule } from '../../services/workflowRuntime/modules/detectFacesModule';
import { createDetectSensitiveContentModule } from '../../services/workflowRuntime/modules/detectSensitiveContentModule';
import { createGenerateAiMetadataModule } from '../../services/workflowRuntime/modules/generateAiMetadataModule';
import { createGenerateFaceVectorsModule } from '../../services/workflowRuntime/modules/generateFaceVectorsModule';
import { createGeneratePreviewsModule } from '../../services/workflowRuntime/modules/generatePreviewsModule';
import { createGroupSimilarPhotosModule } from '../../services/workflowRuntime/modules/groupSimilarPhotosModule';
import { createExpandSelectionModule } from '../../services/workflowRuntime/modules/expandSelectionModule';
import { createExtractEmbeddedMetadataModule } from '../../services/workflowRuntime/modules/extractEmbeddedMetadataModule';
import { createEstimatePhotoDateModule } from '../../services/workflowRuntime/modules/estimatePhotoDateModule';
import { assetPreviewWorkflowDefinition } from '../../services/workflowRuntime/workflows/assetPreviewWorkflow';
import { createResolvePeopleModule } from '../../services/workflowRuntime/modules/resolvePeopleModule';
import { createScanFolderModule } from '../../services/workflowRuntime/modules/scanFolderModule';
import { libraryAiMetadataWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryAiMetadataWorkflow';
import { libraryFaceWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryFaceWorkflow';
import { folderIngestWorkflowDefinition } from '../../services/workflowRuntime/workflows/folderIngestWorkflow';
import { libraryGroupingWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryGroupingWorkflow';
import { libraryPreviewWorkflowDefinition } from '../../services/workflowRuntime/workflows/libraryPreviewWorkflow';
import { librarySensitiveScanWorkflowDefinition } from '../../services/workflowRuntime/workflows/librarySensitiveScanWorkflow';
import { selectedSubjectMetadataWorkflowDefinition } from '../../services/workflowRuntime/workflows/selectedSubjectMetadataWorkflow';
import { ExecutionStore } from '../../services/workflowRuntime/executionStore';
import { ModuleRegistry } from '../../services/workflowRuntime/moduleRegistry';
import { SubjectRegistry } from '../../services/workflowRuntime/subjectRegistry';
import { WorkflowRegistry } from '../../services/workflowRuntime/workflowRegistry';
import { WorkflowRuntimeOrchestrator } from '../../services/workflowRuntime/orchestrator';
import { runAutoScanWorker, runPreviewWorker } from '../../services/runtimeWorkers';
import type { DatabaseManager } from '../../data/db';
import { createPreviewAdapterModule } from '../../services/workflowRuntime/modules/previewAdapterModule';

type WorkflowRuntimeBundle = {
    store: ExecutionStore;
    workflows: WorkflowRegistry;
    orchestrator: WorkflowRuntimeOrchestrator;
};

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
    modules.register(createScanFolderModule({ dbManager }));
    modules.register(createExpandSelectionModule());
    modules.register(createExtractEmbeddedMetadataModule({ dbManager, eventBus }));
    modules.register(createGeneratePreviewsModule({ dbManager, eventBus }));
    modules.register(createDetectFacesModule({ dbManager, eventBus }));
    modules.register(createGenerateFaceVectorsModule({ dbManager, eventBus }));
    modules.register(createResolvePeopleModule({ dbManager, eventBus }));
    modules.register(createGroupSimilarPhotosModule({ dbManager }));
    modules.register(createDetectSensitiveContentModule({ dbManager, eventBus }));
    modules.register(createGenerateAiMetadataModule({ dbManager, eventBus }));
    modules.register(createEstimatePhotoDateModule({ dbManager, eventBus }));
    modules.register(createPreviewAdapterModule({
        runPreview: async (mediaIds) => {
            await runPreviewWorker(mediaIds, { dbManager, eventBus });
        },
    }));
}

function registerWorkflows(workflows: WorkflowRegistry) {
    workflows.register(folderIngestWorkflowDefinition);
    workflows.register(libraryGroupingWorkflowDefinition);
    workflows.register(assetPreviewWorkflowDefinition);
    workflows.register(libraryPreviewWorkflowDefinition);
    workflows.register(libraryFaceWorkflowDefinition);
    workflows.register(librarySensitiveScanWorkflowDefinition);
    workflows.register(libraryAiMetadataWorkflowDefinition);
    workflows.register(selectedSubjectMetadataWorkflowDefinition);
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
        orchestrator: new WorkflowRuntimeOrchestrator({
            store,
            workflows,
            modules,
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
