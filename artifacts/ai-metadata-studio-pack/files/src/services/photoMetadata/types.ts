export interface PhotoMetadataBoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PhotoMetadataEstimatedDate {
    most_likely_date: string | null;
    min_date: string | null;
    max_date: string | null;
    display_label: string;
    rationale: string | null;
}

export interface PhotoMetadataSubject {
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

export interface PhotoMetadataRegionOfInterest {
    label: string;
    kind: string;
    bounding_box: PhotoMetadataBoundingBox;
    significance: string | null;
}

export interface PhotoMetadataQuality {
    technical: number;
    lighting: number;
    composition: number;
    emotional: number;
    discard: boolean;
}

export interface PhotoMetadataAuthenticity {
    score: number;
    reasons: string[];
}

export interface PhotoMetadataBlock {
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
