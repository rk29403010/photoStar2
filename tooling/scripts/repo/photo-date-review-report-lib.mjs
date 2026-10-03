import fs from 'node:fs';
import path from 'node:path';

function readClaimReferences(db, claimId) {
    return db.prepare(`SELECT reference.role, reference.ordinal, reference.display_text AS evidence,
        source.id AS sourceId, source.kind, source.ref_id AS refId, source.display_text AS sourceText
        FROM analysis_claim_sources reference JOIN analysis_sources source ON source.id = reference.source_id
        WHERE reference.claim_id = ? ORDER BY reference.role, reference.ordinal, reference.source_ordinal`).all(claimId);
}

function readLatestInference(db, assetId) {
    return db.prepare(`SELECT claim.id, claim.value_json, claim.confidence, claim.kind, claim.state,
        run.provider, run.model_version, run.id AS run_id, claim.created_at
        FROM analysis_claims claim JOIN analysis_runs run ON run.id = claim.run_id
        WHERE claim.asset_id = ? AND claim.field = 'date' AND claim.subject_id IS NULL
            AND claim.kind IN ('hypothesis', 'inferred_conclusion') AND run.stage IN ('scout', 'refine')
        ORDER BY claim.created_at DESC, claim.rowid DESC LIMIT 1`).get(assetId);
}

function describeClaim(db, row) {
    if (!row) { return null; }
    return { id: row.id, value: JSON.parse(row.value_json), confidence: row.confidence, kind: row.kind,
        state: row.state, provider: row.provider, modelVersion: row.model_version,
        runId: row.run_id, createdAt: row.created_at, references: readClaimReferences(db, row.id) };
}

function rangesConflict(left, right) {
    if (!left?.start || !left.end || !right?.start || !right.end) { return false; }
    return left.end < right.start || right.end < left.start;
}

export function readPhotoDateReviewCases(db) {
    const rows = db.prepare(`WITH ranked AS (
        SELECT claim.*, ROW_NUMBER() OVER (PARTITION BY claim.asset_id ORDER BY claim.created_at DESC, claim.rowid DESC) AS rank
        FROM analysis_claims claim WHERE claim.field = 'date' AND claim.subject_id IS NULL
            AND claim.kind = 'user_confirmed' AND claim.state = 'active'
    ) SELECT ranked.*, run.provider, run.model_version, asset.original_path, asset.photo_created_at,
        asset.exif_datetime, asset.metadata_timestamp_source
        FROM ranked JOIN assets asset ON asset.id = ranked.asset_id JOIN analysis_runs run ON run.id = ranked.run_id
        WHERE ranked.rank = 1 ORDER BY ranked.created_at DESC, ranked.asset_id`).all();
    return rows.map(row => {
        const confirmed = describeClaim(db, row);
        const inferred = describeClaim(db, readLatestInference(db, row.asset_id));
        const hasContradiction = rangesConflict(confirmed.value, inferred?.value)
            || (inferred?.references.some(reference => reference.role === 'contradiction') ?? false);
        return { assetId: row.asset_id, originalPath: row.original_path, confirmed, inferred, hasContradiction,
            storedPhotoCreatedAt: row.photo_created_at,
            localTimestamp: { value: row.exif_datetime, source: row.metadata_timestamp_source } };
    });
}

function displayDate(value) {
    return value?.label ?? 'Unknown';
}

function renderReferences(references) {
    return references.map(reference => `- ${reference.role}: ${reference.evidence ?? reference.sourceText} (source ${reference.sourceId}, ${reference.kind})`);
}

function renderCase(summary) {
    const lines = [
        `## ${summary.assetId}`, '',
        `- Path: \`${summary.originalPath}\``,
        `- User-confirmed date: ${displayDate(summary.confirmed.value)} (${summary.confirmed.confidence})`,
        `- Confirmed: ${summary.confirmed.createdAt}`,
        `- Current stored date: ${summary.storedPhotoCreatedAt ?? 'Unknown'}`,
        `- Local timestamp: ${summary.localTimestamp.value ?? 'Unknown'} (${summary.localTimestamp.source ?? 'unknown source'})`,
        `- Contradictory evidence: ${summary.hasContradiction ? 'yes' : 'none recorded'}`,
        ...renderReferences(summary.confirmed.references),
    ];
    if (summary.inferred) {
        const inferred = summary.inferred;
        lines.push(`- AI ${inferred.kind}: ${displayDate(inferred.value)} (${inferred.confidence}; ${inferred.state})`,
            `- Produced by: ${inferred.provider} / ${inferred.modelVersion ?? 'unreported model version'} / run ${inferred.runId}`,
            ...renderReferences(inferred.references));
    }
    lines.push('');
    return lines.join('\n');
}

export function renderPhotoDateReviewMarkdown(cases, options = {}) {
    return [
        '# Photo Date Review Report', '',
        `Generated: ${options.generatedAt ?? new Date().toISOString()}`,
        `Source: ${options.sourceLabel ?? 'PhotoLibraryDesktop'}`, '',
        `User-confirmed cases: ${cases.length}`,
        `Cases with contradictions: ${cases.filter(item => item.hasContradiction).length}`, '',
        'User-confirmed values remain authoritative. AI hypotheses and conclusions are included with their evidence and source references for review.', '',
        ...cases.map(renderCase),
    ].join('\n');
}

export function writePhotoDateReviewReport(params) {
    const cases = readPhotoDateReviewCases(params.db);
    const generatedAt = new Date().toISOString();
    const sourceLabel = params.sourceLabel ?? params.dbPath ?? 'PhotoLibraryDesktop';
    const markdown = renderPhotoDateReviewMarkdown(cases, { generatedAt, sourceLabel });
    fs.mkdirSync(params.outputDir, { recursive: true });
    const markdownPath = path.join(params.outputDir, 'photo-date-review-report.md');
    const jsonPath = path.join(params.outputDir, 'photo-date-review-report.json');
    fs.writeFileSync(markdownPath, markdown, 'utf8');
    fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt, sourceLabel, totalCases: cases.length,
        contradictoryCases: cases.filter(item => item.hasContradiction).length, cases }, null, 2), 'utf8');
    return { cases, generatedAt, jsonPath, markdown, markdownPath };
}
