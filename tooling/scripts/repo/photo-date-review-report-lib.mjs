import fs from 'node:fs';
import path from 'node:path';

const REVIEW_USER_ID = 'photo-date-review';
const REVIEW_FIELD_PATH = 'estimated_date.most_likely_date';

const REASON_ACTIONS = {
    scanned_or_edited: 'Downweight scanner/editor-style timestamps and add a regression case.',
    born_digital_exif_wrong: 'Add a born-digital wide-divergence regression and revisit the override threshold.',
    ai_right_metadata_wrong: 'Promote structured AI dates when weak metadata conflicts with them.',
    ai_wrong_metadata_right: 'Treat this as an AI/date-resolver miss before changing metadata weighting.',
    manual_family_knowledge: 'Keep as a manual override and exclude it from algorithm tuning.',
};

function parseJsonValue(value, fallback = null) {
    if (typeof value !== 'string') {
        return fallback;
    }

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function toNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function extractReviewReason(note) {
    const text = toNonEmptyString(note);
    if (!text) {
        return null;
    }

    const [firstLine] = text.split(/\r?\n/, 1);
    const prefix = 'photo_date_review_reason=';
    if (!firstLine.startsWith(prefix)) {
        return null;
    }

    return firstLine.slice(prefix.length).trim() || null;
}

function extractReviewNoteBody(note) {
    const text = toNonEmptyString(note);
    if (!text) {
        return null;
    }

    const lines = text.split(/\r?\n/);
    return lines.slice(1).join('\n').trim() || null;
}

function getSuggestedAction(reasonCode) {
    return REASON_ACTIONS[reasonCode] ?? 'Review this case manually before tuning the estimator.';
}

function compareSignals(left, right) {
    const leftWeight = typeof left?.weight === 'number' ? left.weight : -1;
    const rightWeight = typeof right?.weight === 'number' ? right.weight : -1;
    if (leftWeight !== rightWeight) {
        return rightWeight - leftWeight;
    }
    return String(left?.label ?? '').localeCompare(String(right?.label ?? ''));
}

function toSignalSummary(signal) {
    return {
        origin: toNonEmptyString(signal?.origin) ?? 'unknown',
        label: toNonEmptyString(signal?.label) ?? toNonEmptyString(signal?.source) ?? 'Unknown signal',
        weight: typeof signal?.weight === 'number' ? signal.weight : 0,
        precision: toNonEmptyString(signal?.precision),
        source: toNonEmptyString(signal?.source),
        start: toNonEmptyString(signal?.start),
        end: toNonEmptyString(signal?.end),
        representativeAt: toNonEmptyString(signal?.representativeAt),
    };
}

function parseSignals(estimateData) {
    const estimate = parseJsonValue(estimateData, {});
    const signals = Array.isArray(estimate?.signals) ? estimate.signals.map(toSignalSummary) : [];
    return signals.sort(compareSignals);
}

function findLikelyWinningSignal(estimateData) {
    const estimate = parseJsonValue(estimateData, {});
    const targetValue = toNonEmptyString(estimate?.photoCreatedAt);
    if (!targetValue) {
        return null;
    }

    const targetMs = Date.parse(targetValue);
    if (!Number.isFinite(targetMs)) {
        return null;
    }

    const rankedSignals = parseSignals(estimateData);
    const overlappingSignals = rankedSignals.filter((signal) => {
        const startMs = Date.parse(signal.start ?? '');
        const endMs = Date.parse(signal.end ?? '');
        return Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= targetMs && targetMs <= endMs;
    });

    return overlappingSignals[0] ?? rankedSignals[0] ?? null;
}

function buildCaseSummary(row) {
    const correctedDate = parseJsonValue(row.corrected_date_json, '');
    const estimate = parseJsonValue(row.estimate_data, {});
    const topSignals = parseSignals(row.estimate_data).slice(0, 5);
    const reasonCode = extractReviewReason(row.review_note) ?? 'manual_family_knowledge';

    return {
        assetId: row.asset_id,
        originalPath: row.original_path,
        reviewedAt: row.reviewed_at,
        correctedDate: typeof correctedDate === 'string' ? correctedDate : String(correctedDate ?? ''),
        reasonCode,
        reviewNote: extractReviewNoteBody(row.review_note),
        isAlgorithmicCandidate: reasonCode !== 'manual_family_knowledge',
        suggestedAction: getSuggestedAction(reasonCode),
        storedPhotoCreatedAt: row.photo_created_at,
        storedConfidence: typeof row.photo_created_at_confidence === 'number' ? row.photo_created_at_confidence : null,
        storedTimestampSource: row.metadata_timestamp_source,
        exifDateTime: row.exif_datetime,
        aiMostLikelyDate: row.ai_most_likely_date,
        aiDisplayLabel: row.ai_display_label,
        aiRationale: row.ai_rationale,
        estimateConfidence: typeof estimate?.confidence?.score === 'number' ? estimate.confidence.score : null,
        estimateReasons: Array.isArray(estimate?.confidence?.reasons) ? estimate.confidence.reasons.filter((item) => typeof item === 'string') : [],
        likelyWinningSignal: findLikelyWinningSignal(row.estimate_data),
        topSignals,
    };
}

function readReviewRows(db) {
    return db.prepare(`
        WITH ranked_reviews AS (
            SELECT
                assertion.id AS assertion_id,
                assertion.asset_id,
                assertion.value_json AS corrected_date_json,
                assertion.note AS review_note,
                assertion.created_at AS reviewed_at,
                ROW_NUMBER() OVER (
                    PARTITION BY assertion.asset_id
                    ORDER BY datetime(assertion.created_at) DESC, assertion.created_at DESC, assertion.id DESC
                ) AS review_rank
            FROM photo_metadata_assertions assertion
            WHERE assertion.user_id = ?
              AND assertion.field_path = ?
        ),
        ranked_estimates AS (
            SELECT
                result.asset_id,
                result.data AS estimate_data,
                ROW_NUMBER() OVER (
                    PARTITION BY result.asset_id
                    ORDER BY datetime(result.created_at) DESC, result.created_at DESC, result.id DESC
                ) AS estimate_rank
            FROM derived_results result
            WHERE result.task = 'photo_date_estimate'
        )
        SELECT
            review.asset_id,
            review.corrected_date_json,
            review.review_note,
            review.reviewed_at,
            asset.original_path,
            asset.photo_created_at,
            asset.photo_created_at_confidence,
            asset.exif_datetime,
            asset.metadata_timestamp_source,
            projection.estimated_date_most_likely AS ai_most_likely_date,
            projection.estimated_date_display_label AS ai_display_label,
            projection.estimated_date_rationale AS ai_rationale,
            estimate.estimate_data
        FROM ranked_reviews review
        JOIN assets asset ON asset.id = review.asset_id
        LEFT JOIN photo_metadata_projection projection ON projection.asset_id = review.asset_id
        LEFT JOIN ranked_estimates estimate ON estimate.asset_id = review.asset_id AND estimate.estimate_rank = 1
        WHERE review.review_rank = 1
        ORDER BY datetime(review.reviewed_at) DESC, review.reviewed_at DESC, review.asset_id ASC
    `).all(REVIEW_USER_ID, REVIEW_FIELD_PATH);
}

export function readPhotoDateReviewCases(db) {
    return readReviewRows(db).map(buildCaseSummary);
}

function formatConfidence(score) {
    return typeof score === 'number' ? `${Math.round(score * 100)}%` : 'Unknown';
}

function renderCaseSection(caseSummary) {
    const lines = [
        `## ${caseSummary.assetId}`,
        '',
        `- Path: \`${caseSummary.originalPath}\``,
        `- Reviewed: ${caseSummary.reviewedAt}`,
        `- Corrected date: ${caseSummary.correctedDate}`,
        `- Current stored date: ${caseSummary.storedPhotoCreatedAt ?? 'Unknown'}`,
        `- Review reason: ${caseSummary.reasonCode}`,
        `- Suggested action: ${caseSummary.suggestedAction}`,
        `- AI date: ${caseSummary.aiMostLikelyDate ?? caseSummary.aiDisplayLabel ?? 'Unknown'}`,
        `- Metadata timestamp: ${caseSummary.exifDateTime ?? 'Unknown'}${caseSummary.storedTimestampSource ? ` (${caseSummary.storedTimestampSource})` : ''}`,
        `- Estimate confidence: ${formatConfidence(caseSummary.estimateConfidence)}`,
    ];

    if (caseSummary.reviewNote) {
        lines.push(`- Review note: ${caseSummary.reviewNote}`);
    }
    if (caseSummary.aiRationale) {
        lines.push(`- AI rationale: ${caseSummary.aiRationale}`);
    }
    if (caseSummary.likelyWinningSignal) {
        lines.push(`- Likely winning signal: ${caseSummary.likelyWinningSignal.origin} · ${caseSummary.likelyWinningSignal.label} · ${caseSummary.likelyWinningSignal.weight.toFixed(2)}`);
    }
    if (caseSummary.topSignals.length > 0) {
        lines.push('- Top signals:');
        for (const signal of caseSummary.topSignals) {
            lines.push(`  - ${signal.origin} · ${signal.label} · ${signal.weight.toFixed(2)}`);
        }
    }
    if (caseSummary.estimateReasons.length > 0) {
        lines.push('- Confidence notes:');
        for (const reason of caseSummary.estimateReasons) {
            lines.push(`  - ${reason}`);
        }
    }

    lines.push('');
    return lines.join('\n');
}

export function renderPhotoDateReviewMarkdown(cases, options = {}) {
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const sourceLabel = options.sourceLabel ?? 'PhotoLibraryDesktop';
    const algorithmicCandidates = cases.filter((item) => item.isAlgorithmicCandidate);
    const manualOnlyCases = cases.length - algorithmicCandidates.length;

    const sections = [
        '# Photo Date Review Report',
        '',
        `Generated: ${generatedAt}`,
        `Source: ${sourceLabel}`,
        '',
        `Flagged cases: ${cases.length}`,
        `Algorithmic candidates: ${algorithmicCandidates.length}`,
        `Manual-only cases: ${manualOnlyCases}`,
        '',
    ];

    for (const caseSummary of cases) {
        sections.push(renderCaseSection(caseSummary));
    }

    return sections.join('\n');
}

export function writePhotoDateReviewReport(params) {
    const cases = readPhotoDateReviewCases(params.db);
    const generatedAt = new Date().toISOString();
    const sourceLabel = params.sourceLabel ?? params.dbPath ?? 'PhotoLibraryDesktop';
    const markdown = renderPhotoDateReviewMarkdown(cases, { generatedAt, sourceLabel });
    const outputDir = params.outputDir;
    fs.mkdirSync(outputDir, { recursive: true });

    const markdownPath = path.join(outputDir, 'photo-date-review-report.md');
    const jsonPath = path.join(outputDir, 'photo-date-review-report.json');
    fs.writeFileSync(markdownPath, markdown, 'utf8');
    fs.writeFileSync(jsonPath, JSON.stringify({
        generatedAt,
        sourceLabel,
        totalCases: cases.length,
        algorithmicCandidates: cases.filter((item) => item.isAlgorithmicCandidate).length,
        manualOnlyCases: cases.filter((item) => !item.isAlgorithmicCandidate).length,
        cases,
    }, null, 2), 'utf8');

    return {
        cases,
        generatedAt,
        jsonPath,
        markdown,
        markdownPath,
    };
}
