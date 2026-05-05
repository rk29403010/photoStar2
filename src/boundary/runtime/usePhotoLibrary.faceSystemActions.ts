import type { Dispatch, SetStateAction } from 'react';
import type { Person } from '@contracts/core';
import type { BackgroundJob, PipelineStage } from '@contracts/jobs';
import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';
import type { RefreshLibraryOptions } from '@ui/hooks/usePhotoLibrary.gallery';
import { startWorkflowWithOverlayJob } from '@boundary/runtime/workflowOverlayJobs';

type FaceSystemActionParams = {
    addJob: (id: string, stage: PipelineStage, title: string) => void;
    request: RequestFn;
    sendCommand: (command: string, payload?: Record<string, unknown>) => Promise<void>;
    setStatus: (status: string) => void;
    setPeople: Dispatch<SetStateAction<Person[]>>;
    refreshLibrary: (options?: RefreshLibraryOptions) => void;
    refreshPeople: () => void;
    refreshSystemJobs: () => void;
    updateJobState: (id: string, state: BackgroundJob['state']) => void;
}

export function createFaceSystemActions(params: FaceSystemActionParams) {
    return {
        resetFaces: async () => {
            params.setStatus('Resetting faces...');
            params.setPeople([]);
            await params.sendCommand('reset_faces');
            setTimeout(() => {
                params.refreshLibrary();
                params.refreshPeople();
                params.setStatus('Faces reset.');
            }, 1000);
        },
        rerunFaceDetectionForAsset: async (assetId: string) => {
            params.setStatus('Resetting face data for photo...');
            await params.request<void>({
                idPrefix: `reset_faces_${assetId}`,
                command: 'reset_faces',
                payload: { mediaId: assetId },
                timeoutMs: 10000,
                select: () => undefined,
            });
            const runId = await startWorkflowWithOverlayJob({
                request: params.request,
                addJob: params.addJob,
                updateJobState: params.updateJobState,
                refreshLibrary: params.refreshLibrary,
                refreshSystemJobs: params.refreshSystemJobs,
                idPrefix: `start_library_face_${assetId}`,
                command: 'start_library_face_workflow',
                payload: { mediaId: assetId },
                stage: 'face_analysis',
                title: 'Analysing Faces for Photo',
            });
            params.refreshLibrary({ preservePagingState: true });
            params.refreshPeople();
            params.refreshSystemJobs();
            params.setStatus('Face detection rerun queued for photo.');
            return runId;
        },
    };
}
