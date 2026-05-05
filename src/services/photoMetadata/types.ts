export type PhotoMetadataBoundingBox = {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type PhotoMetadataEstimatedDate = {
    most_likely_date: string | null;
    min_date: string | null;
    max_date: string | null;
    display_label: string;
    rationale: string | null;
}

export type PhotoMetadataSubject = {
    label: string;
    bounding_box: PhotoMetadataBoundingBox;
    type: 'person' | 'pet';
    location_desc: string;
    gender: string | null;
    animal_type: string | null;
    age_range: string | null;
    dob_range: string | null;
    emotion: string | null;
    gaze: string | null;
    features: string | null;
    uniform: string | null;
    suggested_names: string[];
}

export type PhotoMetadataRegionOfInterest = {
    label: string;
    kind: string;
    bounding_box: PhotoMetadataBoundingBox;
    significance: string | null;
}

export type PhotoMetadataQuality = {
    technical: number;
    lighting: number;
    composition: number;
    emotional: number;
    discard: boolean;
}

export type PhotoMetadataAuthenticity = {
    score: number;
    reasons: string[];
}

export type PhotoMetadataBlock = {
    type: string;
    caption: string;
    description: string;
    location: string;
    estimated_date: PhotoMetadataEstimatedDate;
    subjects: PhotoMetadataSubject[];
    regions_of_interest: PhotoMetadataRegionOfInterest[];
    keywords: string[];
    emotional_impact: string;
    quality: PhotoMetadataQuality;
    recommended_enhancements: string[];
    authenticity: PhotoMetadataAuthenticity;
}
