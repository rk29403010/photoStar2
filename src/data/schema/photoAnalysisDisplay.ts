const winner = (field: string, expression: string) => `MAX(CASE WHEN field = '${field}' AND subject_id IS NULL THEN ${expression} END)`;
const sourceColumns = (name: string, field: string) => `${winner(field, 'stage')} AS ${name}_source_kind, ${winner(field, 'id')} AS ${name}_source_id`;

/** A read model of current claims, never a writable blob/projection cache. */
export const PHOTO_ANALYSIS_DISPLAY_SQL = `
  CREATE VIEW IF NOT EXISTS photo_analysis_winners AS
  SELECT * FROM (
    SELECT c.*, r.stage, ROW_NUMBER() OVER (
      PARTITION BY c.asset_id, c.field, c.subject_id
      ORDER BY CASE c.kind WHEN 'user_confirmed' THEN 4 WHEN 'known_fact' THEN 3
        WHEN 'inferred_conclusion' THEN 2 WHEN 'hypothesis' THEN 1 ELSE 0 END DESC, c.rowid DESC
    ) AS winner_rank
    FROM analysis_claims c JOIN analysis_runs r ON r.id = c.run_id WHERE c.state = 'active'
  ) WHERE winner_rank = 1;
  CREATE VIEW IF NOT EXISTS photo_analysis_display AS
  SELECT asset_id,
    ${winner('classification', "json_extract(value_json, '$[0]')")} AS type,
    ${sourceColumns('type', 'classification')},
    ${winner('caption', "json_extract(value_json, '$')")} AS caption,
    ${sourceColumns('caption', 'caption')},
    ${winner('description', "json_extract(value_json, '$')")} AS description,
    ${sourceColumns('description', 'description')},
    ${winner('location', "json_extract(value_json, '$.label')")} AS location,
    ${sourceColumns('location', 'location')},
    ${winner('date', "CASE WHEN json_extract(value_json, '$.start') = json_extract(value_json, '$.end') THEN json_extract(value_json, '$.start') END")} AS estimated_date_most_likely,
    ${winner('date', "json_extract(value_json, '$.start')")} AS estimated_date_min,
    ${winner('date', "json_extract(value_json, '$.end')")} AS estimated_date_max,
    ${winner('date', "json_extract(value_json, '$.label')")} AS estimated_date_display_label,
    NULL AS estimated_date_rationale, ${sourceColumns('estimated_date', 'date')},
    ${winner('tags', 'value_json')} AS keywords_json, ${sourceColumns('keywords', 'tags')},
    NULL AS emotional_impact, NULL AS emotional_impact_source_kind, NULL AS emotional_impact_source_id,
    NULL AS quality_technical, NULL AS quality_lighting, NULL AS quality_composition,
    NULL AS quality_emotional, NULL AS quality_discard, ${sourceColumns('quality', 'quality')},
    '[]' AS recommended_enhancements_json, ${sourceColumns('recommended_enhancements', 'enhancements')},
    NULL AS authenticity_score, '[]' AS authenticity_reasons_json,
    NULL AS authenticity_source_kind, NULL AS authenticity_source_id,
    (SELECT json_group_array(json_object('face_id', p.subject_id,
        'apparentAge', json_extract(p.value_json, '$.apparentAge'),
        'presentation', json_extract(p.value_json, '$.presentation'),
        'expression', json_extract(p.value_json, '$.expression'), 'clothing', json_extract(p.value_json, '$.clothing')))
      FROM photo_analysis_winners p WHERE p.asset_id = w.asset_id AND p.field = 'appearance') AS subjects_json,
    NULL AS subjects_source_kind, NULL AS subjects_source_id,
    (SELECT json_group_array(json_object('id', region.id, 'kind', json_extract(region.label, '$.kind'),
        'label', json_extract(region.label, '$.observation'), 'bounding_box', json(region.photo_box_json)))
      FROM analysis_regions region WHERE region.asset_id = w.asset_id) AS regions_of_interest_json,
    NULL AS regions_of_interest_source_kind, NULL AS regions_of_interest_source_id
  FROM photo_analysis_winners w GROUP BY asset_id;
`;
