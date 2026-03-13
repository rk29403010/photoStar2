export interface WorkflowRuntimeTelemetrySink {
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
}
