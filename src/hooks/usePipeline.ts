import { useEffect, useRef } from 'react';
import type { BackgroundJob } from '../types/jobs';

export function usePipeline(
    jobs: BackgroundJob[],
    actions: {
        detectFaces: () => void;
        recogniseFaces: () => void;
        clusterFaces: () => void;
    }
) {
    // We need to track which jobs we've already reacted to, to avoid double-triggering
    const handledJobs = useRef<Set<string>>(new Set());

    useEffect(() => {
        // Look for recently completed jobs
        jobs.forEach(job => {
            if (job.state === 'completed' && !handledJobs.current.has(job.id)) {

                // Mark as handled immediately
                handledJobs.current.add(job.id);

                console.log(`[Pipeline] Job ${job.id} (${job.kind}) completed. Checking for triggers...`);

                // Rule: bulk_ingest -> detect_faces
                if (job.kind === 'bulk_ingest' || job.kind === 'watched_folder_ingest') {
                    console.log('[Pipeline] Ingest complete. Triggering Face Detection.');
                    // Added a small delay to ensure UI updates and backend is ready
                    setTimeout(() => actions.detectFaces(), 1000);
                }

                // Rule: face_analysis (Detect) -> recognise_faces
                // Note: 'face_analysis' is used for both Detect and Recognise.
                // We distinguish them by title or we can add a subtype later.
                // For now, let's look at the title or assume the flow based on context.
                // BUT, since we use the same kind, we need to be careful.
                // Let's rely on the title for now, it's brittle but works for this specific requested flow.
                if (job.kind === 'face_analysis') {
                    if (job.title === 'Detect Faces') {
                        console.log('[Pipeline] Detection complete. Triggering Recognition.');
                        setTimeout(() => actions.recogniseFaces(), 1000);
                    } else if (job.title === 'Recognise Faces') {
                        console.log('[Pipeline] Recognition complete. Triggering Clustering.');
                        setTimeout(() => actions.clusterFaces(), 1000);
                    }
                }
            }
        });
    }, [jobs, actions]);
}
