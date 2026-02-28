import { DomainEvent } from '../events/types';

export type WorkflowDefinition = {
    trigger: DomainEvent['type'];
    action: (event: any) => Promise<DomainEvent[] | void>;
};

// This file is a placeholder for declarative workflow definitions.
// Ideally, this would be a static structure, but for now we might use it to export constants
// or types that define the shape of our workflows.

export const WORKFLOWS = {
    INGEST: 'IngestWorkflow',
    PREVIEW: 'PreviewWorkflow',
    FACE_ANALYSIS: 'FaceAnalysisWorkflow'
};
