type LatestDerivedResultJoinParams = {
    assetAlias: string;
    joinAlias: string;
    task: string;
};

function toSqlStringLiteral(value: string) {
    return `'${value.replaceAll("'", "''")}'`;
}

export function buildLatestDerivedResultJoin(params: LatestDerivedResultJoinParams) {
    const { assetAlias, joinAlias, task } = params;
    const taskLiteral = toSqlStringLiteral(task);

    return `
        LEFT JOIN derived_results ${joinAlias}
            ON ${joinAlias}.id = (
                SELECT latest.id
                FROM derived_results latest
                WHERE latest.asset_id = ${assetAlias}.id
                  AND latest.task = ${taskLiteral}
                ORDER BY datetime(latest.created_at) DESC, latest.created_at DESC, latest.id DESC
                LIMIT 1
            )
    `;
}

export type AssetDetailLevel = 'gallery' | 'full';

export type AssetDetailFragments = {
    projectionSelect: string;
    projectionJoin: string;
    recSelect: string;
    recJoin: string;
    aiSelect: string;
    aiJoin: string;
    embeddedMetadataSelect: string;
    embeddedMetadataJoin: string;
};

export function buildAssetDetailFragments(params: {
    detailLevel: AssetDetailLevel;
    includeEvidence: boolean;
    recAlias: string;
    aiNewAlias: string;
    aiLegacyAlias: string;
    projectionAlias: string;
}): AssetDetailFragments {
    const { detailLevel, includeEvidence, recAlias, aiNewAlias, aiLegacyAlias, projectionAlias } = params;
    const projectionSelect = `
                ${projectionAlias}.type as type,
                ${projectionAlias}.type_source_kind as type_source_kind,
                ${projectionAlias}.type_source_id as type_source_id,
                COALESCE(${projectionAlias}.caption, a.caption) as caption,
                ${projectionAlias}.caption_source_kind as caption_source_kind,
                ${projectionAlias}.caption_source_id as caption_source_id,
                ${projectionAlias}.description as description,
                ${projectionAlias}.description_source_kind as description_source_kind,
                ${projectionAlias}.description_source_id as description_source_id,
                ${projectionAlias}.location as location,
                ${projectionAlias}.location_source_kind as location_source_kind,
                ${projectionAlias}.location_source_id as location_source_id,
                ${projectionAlias}.estimated_date_most_likely as estimated_date_most_likely,
                ${projectionAlias}.estimated_date_min as estimated_date_min,
                ${projectionAlias}.estimated_date_max as estimated_date_max,
                ${projectionAlias}.estimated_date_display_label as estimated_date_display_label,
                ${projectionAlias}.estimated_date_rationale as estimated_date_rationale,
                ${projectionAlias}.estimated_date_source_kind as estimated_date_source_kind,
                ${projectionAlias}.estimated_date_source_id as estimated_date_source_id,
                ${projectionAlias}.keywords_json as keywords_json,
                ${projectionAlias}.keywords_source_kind as keywords_source_kind,
                ${projectionAlias}.keywords_source_id as keywords_source_id,
                ${projectionAlias}.emotional_impact as emotional_impact,
                ${projectionAlias}.emotional_impact_source_kind as emotional_impact_source_kind,
                ${projectionAlias}.emotional_impact_source_id as emotional_impact_source_id,
                ${projectionAlias}.quality_technical as quality_technical,
                ${projectionAlias}.quality_lighting as quality_lighting,
                ${projectionAlias}.quality_composition as quality_composition,
                ${projectionAlias}.quality_emotional as quality_emotional,
                ${projectionAlias}.quality_discard as quality_discard,
                ${projectionAlias}.quality_source_kind as quality_source_kind,
                ${projectionAlias}.quality_source_id as quality_source_id,
                ${projectionAlias}.recommended_enhancements_json as recommended_enhancements_json,
                ${projectionAlias}.recommended_enhancements_source_kind as recommended_enhancements_source_kind,
                ${projectionAlias}.recommended_enhancements_source_id as recommended_enhancements_source_id,
                ${projectionAlias}.authenticity_score as authenticity_score,
                ${projectionAlias}.authenticity_reasons_json as authenticity_reasons_json,
                ${projectionAlias}.authenticity_source_kind as authenticity_source_kind,
                ${projectionAlias}.authenticity_source_id as authenticity_source_id,
                ${projectionAlias}.subjects_json as subjects_json,
                ${projectionAlias}.subjects_source_kind as subjects_source_kind,
                ${projectionAlias}.subjects_source_id as subjects_source_id,
                ${projectionAlias}.regions_of_interest_json as regions_of_interest_json,
                ${projectionAlias}.regions_of_interest_source_kind as regions_of_interest_source_kind,
                ${projectionAlias}.regions_of_interest_source_id as regions_of_interest_source_id,`;
    const projectionJoin = `LEFT JOIN photo_metadata_projection ${projectionAlias} ON ${projectionAlias}.asset_id = a.id`;
    if (detailLevel === 'gallery' || !includeEvidence) {
        return {
            projectionSelect,
            projectionJoin,
            recSelect: 'null as rec_data,',
            recJoin: '',
            aiSelect: 'null as ai_metadata_data,',
            aiJoin: '',
            embeddedMetadataSelect: 'null as embedded_metadata_data,',
            embeddedMetadataJoin: '',
        };
    }

    return {
        projectionSelect,
        projectionJoin,
        recSelect: `${recAlias}.data as rec_data,`,
        recJoin: buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: recAlias, task: 'face_recognition' }),
        aiSelect: `COALESCE(${aiNewAlias}.data, ${aiLegacyAlias}.data) as ai_metadata_data,`,
        aiJoin: `
            ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: aiNewAlias, task: 'ai_metadata' })}
            ${buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: aiLegacyAlias, task: 'photo_metadata' })}`,
        embeddedMetadataSelect: 'r_meta.data as embedded_metadata_data,',
        embeddedMetadataJoin: buildLatestDerivedResultJoin({ assetAlias: 'a', joinAlias: 'r_meta', task: 'embedded_metadata' }),
    };
}
