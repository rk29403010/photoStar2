export type WorkflowRuntimeTelemetrySink = {
    emit(event: { type: string; [key: string]: unknown }): void;
}

export class WorkflowRuntimeTelemetry {
    constructor(private readonly sink?: WorkflowRuntimeTelemetrySink) {}

    public runStarted(runId: string, workflowId: string): void {
        this.sink?.emit({ type: 'RunStarted', runId, workflowId });
    }

    public runCompleted(runId: string, workflowId: string): void {
        this.sink?.emit({ type: 'RunCompleted', runId, workflowId });
    }

    public runFailed(runId: string, workflowId: string, errorMessage: string): void {
        this.sink?.emit({ type: 'RunFailed', runId, workflowId, errorMessage });
    }

    public stepStarted(runId: string, nodeId: string, expectedItems: number): void {
        this.sink?.emit({ type: 'WorkflowStepStarted', runId, nodeId, expectedItems });
    }

    public stepCompleted(runId: string, nodeId: string): void {
        this.sink?.emit({ type: 'WorkflowStepCompleted', runId, nodeId });
    }

    public stepFailed(runId: string, nodeId: string, errorMessage?: string): void {
        this.sink?.emit({ type: 'WorkflowStepFailed', runId, nodeId, errorMessage });
    }

    public subjectStarted(runId: string, nodeId: string, subjectType: string, subjectId: string): void {
        this.sink?.emit({ type: 'WorkflowSubjectStarted', runId, nodeId, subjectType, subjectId });
    }

    public subjectCompleted(runId: string, nodeId: string, subjectType: string, subjectId: string): void {
        this.sink?.emit({ type: 'WorkflowSubjectCompleted', runId, nodeId, subjectType, subjectId });
    }

    public subjectFailed(runId: string, nodeId: string, subjectType: string, subjectId: string, errorMessage?: string): void {
        this.sink?.emit({ type: 'WorkflowSubjectFailed', runId, nodeId, subjectType, subjectId, errorMessage });
    }
}
