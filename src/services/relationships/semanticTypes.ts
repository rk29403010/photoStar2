export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SemanticEntityKind =
    | 'asset'
    | 'photograph'
    | 'person'
    | 'place'
    | 'event'
    | 'object'
    | 'sequence'
    | 'maker'
    | 'memory'
    | 'region'
    | 'video_moment'
    | 'document'
    | 'external_record';

export type SemanticObjectRef =
    | {
        type: 'entity';
        entityId: string;
    }
    | {
        type: 'value';
        valueType: string;
        value: JsonValue;
    };

export type SemanticSourceKind = 'human' | 'machine' | 'import' | 'system';
export type SemanticAttestationStance = 'support' | 'oppose';
export type SemanticDecisionStatus = 'accepted' | 'rejected' | 'disputed' | 'unresolved';
export type SemanticResolutionStatus = SemanticDecisionStatus | 'proposed';

export type SemanticEvidenceRef = {
    kind: 'asset' | 'region' | 'audio_span' | 'video_span' | 'document_region' | 'external_record';
    ref: JsonValue;
    label?: string | null;
};

export type SemanticResolution = {
    scopeKey: string;
    status: SemanticResolutionStatus;
    propositionId: string | null;
    candidatePropositionIds: string[];
    decisionId: string | null;
};
