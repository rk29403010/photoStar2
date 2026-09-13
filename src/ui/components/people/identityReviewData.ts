import { useCallback, useEffect, useRef, useState } from 'react';
import { globalRequest } from '@ui/hooks/usePhotoLibrary';
import type { IdentityCandidatePerson, IdentityReviewKind } from './identityReviewChoices';

export type FaceAssignmentInfo = {
    asset_id: string;
    face_id: string;
    visual_region_id: string;
    confidence: number;
    is_suggested: number;
    original_path: string;
    preview_path: string | null;
    candidate_people?: IdentityCandidatePerson[];
};

export type FamilyTreeInfo = { id: string; filename: string; version_label?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentityCandidatePeople(value: unknown): value is IdentityCandidatePerson[] | undefined {
    if (value === undefined) {return true;}
    if (!Array.isArray(value)) {return false;}
    return value.every((person) => isRecord(person)
        && typeof person.personId === 'string'
        && typeof person.name === 'string');
}

function isFaceAssignmentInfo(value: unknown): value is FaceAssignmentInfo {
    if (!isRecord(value)) {return false;}
    return typeof value.asset_id === 'string'
        && typeof value.face_id === 'string'
        && typeof value.visual_region_id === 'string'
        && typeof value.confidence === 'number'
        && typeof value.is_suggested === 'number'
        && typeof value.original_path === 'string'
        && (value.preview_path === null || typeof value.preview_path === 'string')
        && isIdentityCandidatePeople(value.candidate_people);
}

function selectFaceAssignments(data: Record<string, unknown> | undefined) {
    const values = data?.assignments;
    return { assignments: Array.isArray(values) ? values.filter(isFaceAssignmentInfo) : [] };
}

function isFamilyTreeInfo(value: unknown): value is FamilyTreeInfo {
    if (!isRecord(value)) {return false;}
    return typeof value.id === 'string'
        && typeof value.filename === 'string'
        && (value.version_label === undefined || typeof value.version_label === 'string');
}

function selectFamilyTrees(data: Record<string, unknown> | undefined) {
    const values = data?.trees;
    return { trees: Array.isArray(values) ? values.filter(isFamilyTreeInfo) : [] };
}

export function usePersonDetailData(personId: string) {
    const [assignments, setAssignments] = useState<FaceAssignmentInfo[]>([]);
    const [trees, setTrees] = useState<FamilyTreeInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loadAssignments = useCallback(async () => {
        if (!globalRequest) {return;}
        setLoading(true);
        setError(null);
        try {
            const [confirmed, candidates] = await Promise.all([
                globalRequest<{ assignments: FaceAssignmentInfo[] }>({
                    idPrefix: 'get_person_face_assignments', command: 'get_person_face_assignments',
                    payload: { personId }, select: selectFaceAssignments,
                }),
                globalRequest<{ assignments: FaceAssignmentInfo[] }>({
                    idPrefix: 'get_person_face_candidates', command: 'get_person_face_candidates',
                    payload: { personId }, select: selectFaceAssignments,
                }),
            ]);
            setAssignments([
                ...(confirmed.assignments || []).filter((item) => item.is_suggested === 0),
                ...(candidates.assignments || []),
            ]);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setLoading(false);
        }
    }, [personId]);
    useEffect(() => {
        void loadAssignments();
        if (!globalRequest) {return;}
        void globalRequest<{ trees: FamilyTreeInfo[] }>({
            idPrefix: 'get_family_trees', command: 'get_family_trees', payload: {}, select: selectFamilyTrees,
        }).then((result) => setTrees(result.trees || []));
    }, [loadAssignments]);
    return { assignments, error, loadAssignments, loading, trees };
}

export function useFaceAssignmentActions(personId: string, reload: () => Promise<void>) {
    const [feedback, setFeedback] = useState<{ state: 'error' | 'pending' | 'ready'; message: string } | null>(null);
    const lastActionRef = useRef<{ command: string; payload: Record<string, unknown> } | null>(null);
    const run = async (command: string, payload: Record<string, unknown>) => {
        if (!globalRequest) {return;}
        lastActionRef.current = { command, payload };
        setFeedback({ state: 'pending', message: 'Saving identity response…' });
        try {
            await globalRequest({ idPrefix: command, command, payload, select: (data) => data });
            setFeedback({ state: 'ready', message: 'Identity response saved.' });
            void reload();
            globalThis.dispatchEvent(new CustomEvent('refresh-people-list'));
        } catch (cause) {
            setFeedback({
                state: 'error',
                message: cause instanceof Error ? cause.message : 'Identity response could not be saved.',
            });
        }
    };
    const review = (
        faceId: string,
        kind: IdentityReviewKind,
        wording: string,
        candidatePeople: readonly IdentityCandidatePerson[],
    ) => run('record_face_identity_review_response', {
        faceId, personId, kind, rawWording: wording,
        candidatePersonIds: candidatePeople.map((candidate) => candidate.personId),
    });
    const retry = () => {
        if (lastActionRef.current) {
            void run(lastActionRef.current.command, lastActionRef.current.payload);
        }
    };
    const unmatch = async (faceId: string) => {
        if (!globalThis.confirm('Are you sure you want to isolate/unmatch this photo from this person?')) {return;}
        await run('isolate_face', { faceId });
    };
    return { feedback, retry, review, unmatch };
}
