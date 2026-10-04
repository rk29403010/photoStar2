/** Synchronous read protection while incremental reconsideration is still queued. */
export function analysisValiditySql(claimAlias: string): string {
    return `NOT EXISTS (SELECT 1 FROM analysis_claim_roots dep
        JOIN analysis_claims root ON root.id = dep.root_claim_id
        WHERE dep.claim_id = ${claimAlias}.id AND root.state <> 'active')
      AND NOT EXISTS (SELECT 1 FROM analysis_claim_memberships dep
        JOIN photo_event_members member ON member.event_id = dep.event_id AND member.asset_id = dep.asset_id
        WHERE dep.claim_id = ${claimAlias}.id AND (member.state <> 'active' OR member.revision <> dep.revision))
      AND NOT EXISTS (SELECT 1 FROM analysis_claim_sources reference JOIN analysis_sources source ON source.id = reference.source_id
        WHERE reference.claim_id = ${claimAlias}.id AND source.state <> 'active')`;
}
