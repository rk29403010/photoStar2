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
