# Grouping Runtime Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore runtime-native similar-photo grouping so folder ingest writes real duplicate, burst, and variant groups with prerequisite backfill and more accurate graph-based clustering.

**Architecture:** Keep `runtime.group_similar_photos` as the single `once_per_batch` runtime step, but move the real work into focused helpers: prerequisite preparation, library candidate queries, graph clustering, and persistence/cleanup. The module seeds work from changed assets in `batchSubjects`, expands comparisons into the existing library, preserves locked groups, and rewrites impacted non-protected groups deterministically.

**Tech Stack:** TypeScript, Node.js, better-sqlite3, sharp, workflow runtime modules, `node:test`

---

## File Structure

### Primary Files

- Modify: `src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts`
  - Keep this file as a thin orchestration layer for the runtime module.
- Create: `src/services/workflowRuntime/modules/grouping/groupingAssetPrep.ts`
  - Backfill missing `file_hash`, dimensions, timestamps, and perceptual hashes for changed assets.
- Create: `src/services/workflowRuntime/modules/grouping/groupingQueries.ts`
  - Load changed assets, impacted library candidates, and protected-group state.
- Create: `src/services/workflowRuntime/modules/grouping/groupingGraph.ts`
  - Build connected components from similarity edges for burst and variant grouping.
- Create: `src/services/workflowRuntime/modules/grouping/groupingPersistence.ts`
  - Reconcile impacted groups, preserve locked groups, and persist `asset_groups`, `asset_group_members`, and `asset_similarity_edges`.
- Create: `tests/core/workflow-runtime-grouping.test.cjs`
  - Runtime-native integration tests for prerequisite backfill, duplicate grouping, burst grouping, variant clustering, and cleanup rules.

### Reference Files To Read Before Coding

- `docs/superpowers/specs/2026-03-14-grouping-runtime-design.md`
- `src/services/jobs/build_duplicate_groups.ts`
- `src/services/jobs/build_variant_groups.ts`
- `src/services/jobs/build_burst_groups.ts`
- `src/services/jobs/compute_hashes.ts`
- `src/services/file-utils.ts`
- `src/services/math-utils.ts`

## Chunk 1: Test Harness And Prerequisite Backfill

### Task 1: Build the runtime grouping test harness

**Files:**

- Create: `tests/core/workflow-runtime-grouping.test.cjs`
- Read: `tests/core/workflow-runtime-folder-ingest-orchestrator.test.cjs`
- Read: `src/services/workflowRuntime/workflows/folderIngestWorkflow.ts`

- [ ] **Step 1: Write the failing runtime test harness**

```js
test('runtime grouping writes duplicate groups for changed assets', async () => {
    const dbManager = new DatabaseManager(tempDir);
    seedAsset(dbManager, { id: 'asset-a', originalPath: fileA, fileHash: null });
    seedAsset(dbManager, { id: 'asset-b', originalPath: fileB, fileHash: null });

    await runGroupingWorkflow({
        dbManager,
        inputSubjects: [
            { subjectType: 'asset', subjectId: 'asset-a' },
            { subjectType: 'asset', subjectId: 'asset-b' },
        ],
    });

    const groups = dbManager.getDb()
        .prepare("SELECT type, canonical_asset_id FROM asset_groups WHERE type = 'duplicate'")
        .all();
    assert.equal(groups.length, 1);
});
```

- [ ] **Step 2: Run the new test file to verify it fails**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: FAIL because `runtime.group_similar_photos` currently succeeds without writing grouping rows.

- [ ] **Step 3: Add reusable test helpers in the same test file**

```js
function seedAsset(dbManager, asset) {
    dbManager.getDb().prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height, exif_datetime, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        asset.id,
        asset.originalPath,
        asset.fileHash,
        asset.fileSize ?? 0,
        asset.width ?? 0,
        asset.height ?? 0,
        asset.exifDate ?? null,
        new Date().toISOString(),
    );
}
```

- [ ] **Step 4: Re-run the test file to make sure the harness still fails for the right reason**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: FAIL only on missing grouping behavior, not on bad test setup.

- [ ] **Step 5: Commit the test harness**

```bash
git add tests/core/workflow-runtime-grouping.test.cjs
git commit -m "test: add runtime grouping harness"
```

### Task 2: Implement prerequisite backfill for changed assets

**Files:**

- Create: `src/services/workflowRuntime/modules/grouping/groupingAssetPrep.ts`
- Modify: `src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts`
- Read: `src/services/file-utils.ts`
- Read: `src/services/math-utils.ts`
- Test: `tests/core/workflow-runtime-grouping.test.cjs`

- [ ] **Step 1: Add a failing backfill-focused test**

```js
test('runtime grouping backfills missing hashes and dimensions before grouping', async () => {
    await runGroupingWorkflow({ dbManager, inputSubjects: changedAssets });

    const featureRow = dbManager.getDb()
        .prepare('SELECT file_hash, width, height FROM assets WHERE id = ?')
        .get('asset-a');
    const phashRow = dbManager.getDb()
        .prepare('SELECT phash64, dhash64 FROM asset_features WHERE asset_id = ?')
        .get('asset-a');

    assert.ok(featureRow.file_hash);
    assert.ok(featureRow.width > 0);
    assert.ok(featureRow.height > 0);
    assert.ok(phashRow.phash64);
    assert.ok(phashRow.dhash64);
});
```

- [ ] **Step 2: Run the test file to verify the new test fails**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: FAIL because no prerequisite data is being backfilled yet.

- [ ] **Step 3: Implement the smallest useful backfill helper**

```ts
export async function ensureGroupingPrerequisites(params: {
    db: ReturnType<DatabaseManager['getDb']>;
    assetIds: string[];
}): Promise<PreparedGroupingAsset[]> {
    // Load changed assets, compute missing file_hash / dimensions / timestamps,
    // upsert asset_features rows, and return only assets with enough data to group.
}
```

- [ ] **Step 4: Wire the module to call the backfill helper before any grouping logic**

```ts
const preparedAssets = await ensureGroupingPrerequisites({
    db: options.dbManager.getDb(),
    assetIds: context.batchSubjects.map((subject) => subject.subjectId),
});
```

- [ ] **Step 5: Re-run the targeted tests**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: the backfill assertions pass; grouping assertions may still fail.

- [ ] **Step 6: Run staged quality checks for the new TypeScript**

Run: `npm run quality:staged`

Expected: PASS

Run: `npm run complexity:staged`

Expected: PASS with no new complexity violations in grouping helpers.

- [ ] **Step 7: Commit the prerequisite helper**

```bash
git add src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts src/services/workflowRuntime/modules/grouping/groupingAssetPrep.ts tests/core/workflow-runtime-grouping.test.cjs
git commit -m "feat: add runtime grouping prerequisite backfill"
```

## Chunk 2: Duplicate Grouping And Impacted-Library Matching

### Task 3: Restore duplicate grouping for impacted hashes

**Files:**

- Create: `src/services/workflowRuntime/modules/grouping/groupingQueries.ts`
- Create: `src/services/workflowRuntime/modules/grouping/groupingPersistence.ts`
- Modify: `src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts`
- Read: `src/services/jobs/build_duplicate_groups.ts`
- Test: `tests/core/workflow-runtime-grouping.test.cjs`

- [ ] **Step 1: Add a failing duplicate-group test that includes an older library asset**

```js
test('runtime grouping matches changed assets against older library assets by file hash', async () => {
    seedAsset(dbManager, { id: 'library-asset', originalPath: oldFile, fileHash: exactHash });
    seedAsset(dbManager, { id: 'new-asset', originalPath: newFile, fileHash: null });

    await runGroupingWorkflow({
        dbManager,
        inputSubjects: [{ subjectType: 'asset', subjectId: 'new-asset' }],
    });

    const members = dbManager.getDb().prepare(`
        SELECT m.asset_id
        FROM asset_groups g
        JOIN asset_group_members m ON m.group_id = g.id
        WHERE g.type = 'duplicate'
    `).all();
    assert.deepEqual(new Set(members.map((row) => row.asset_id)), new Set(['library-asset', 'new-asset']));
});
```

- [ ] **Step 2: Run the test file to verify the library-match test fails**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: FAIL because the module does not yet expand from changed assets into existing-library hash matches.

- [ ] **Step 3: Implement duplicate candidate queries and deterministic persistence**

```ts
export function loadImpactedDuplicateSets(db: DbHandle, changedAssetIds: string[]): DuplicateSet[] {
    // Load hashes touched by changed assets, then fetch all library rows sharing those hashes.
}

export function reconcileDuplicateGroups(db: DbHandle, duplicateSets: DuplicateSet[]): void {
    // Preserve locked groups, rebuild non-locked duplicate groups, and rewrite members deterministically.
}
```

- [ ] **Step 4: Wire duplicate reconciliation into the runtime module before burst and variant logic**

```ts
await reconcileImpactedDuplicateGroups({
    db,
    changedAssets: preparedAssets,
});
```

- [ ] **Step 5: Re-run the duplicate-focused tests**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: duplicate tests pass; burst/variant tests may still be pending.

- [ ] **Step 6: Commit the duplicate-grouping slice**

```bash
git add src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts src/services/workflowRuntime/modules/grouping/groupingQueries.ts src/services/workflowRuntime/modules/grouping/groupingPersistence.ts tests/core/workflow-runtime-grouping.test.cjs
git commit -m "feat: restore runtime duplicate grouping"
```

### Task 4: Preserve locked groups while replacing stale proposed results

**Files:**

- Modify: `src/services/workflowRuntime/modules/grouping/groupingPersistence.ts`
- Test: `tests/core/workflow-runtime-grouping.test.cjs`

- [ ] **Step 1: Add failing cleanup-preservation tests**

```js
test('runtime grouping replaces stale proposed groups for impacted assets', async () => {
    seedProposedVariantGroup(dbManager, ['asset-a', 'asset-b']);
    await runGroupingWorkflow({ dbManager, inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-a' }] });
    assert.equal(countGroup(dbManager, 'variant_set', 'proposed'), 0);
});

test('runtime grouping preserves locked groups for impacted assets', async () => {
    seedLockedDuplicateGroup(dbManager, ['asset-a', 'asset-b']);
    await runGroupingWorkflow({ dbManager, inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-a' }] });
    assert.equal(countLockedGroupMembers(dbManager), 2);
});
```

- [ ] **Step 2: Run the test file to verify the cleanup rules fail first**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: FAIL because stale groups are not yet being reconciled and locked groups are not yet guarded.

- [ ] **Step 3: Implement targeted cleanup helpers**

```ts
export function clearImpactedNonLockedGroups(params: {
    db: DbHandle;
    assetIds: string[];
    types: Array<'duplicate' | 'burst' | 'variant_set'>;
}): void {
    // Remove only non-locked rows touching impacted assets, then clear dependent members and owned edges.
}
```

- [ ] **Step 4: Re-run the test file**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: PASS for cleanup and locked-preservation coverage.

- [ ] **Step 5: Run staged quality checks and commit**

Run: `npm run quality:staged`

Expected: PASS

```bash
git add src/services/workflowRuntime/modules/grouping/groupingPersistence.ts tests/core/workflow-runtime-grouping.test.cjs
git commit -m "feat: preserve locked runtime grouping results"
```

## Chunk 3: Burst And Variant Graph Clustering

### Task 5: Add generic connected-component clustering helpers

**Files:**

- Create: `src/services/workflowRuntime/modules/grouping/groupingGraph.ts`
- Modify: `src/services/workflowRuntime/modules/grouping/groupingQueries.ts`
- Read: `src/services/jobs/build_variant_groups.ts`
- Read: `src/services/jobs/build_burst_groups.ts`
- Test: `tests/core/workflow-runtime-grouping.test.cjs`

- [ ] **Step 1: Add failing graph-clustering tests**

```js
test('runtime variant grouping merges transitive neighbors into one cluster', async () => {
    seedVariantFeature(dbManager, 'asset-a', '0000000000000000');
    seedVariantFeature(dbManager, 'asset-b', '0000000000000001');
    seedVariantFeature(dbManager, 'asset-c', '0000000000000003');

    await runGroupingWorkflow({
        dbManager,
        inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-b' }],
    });

    assert.equal(countMembersForGroupType(dbManager, 'variant_set'), 3);
});
```

- [ ] **Step 2: Run the test file and confirm the transitive-cluster case fails**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: FAIL because the current logic does not yet build graph components.

- [ ] **Step 3: Implement the graph helper and edge-to-component logic**

```ts
export function buildConnectedComponents(nodes: string[], edges: Array<[string, string]>): string[][] {
    // DFS or BFS over adjacency lists, returning deterministic sorted components.
}
```

- [ ] **Step 4: Re-run the test file**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: the transitive variant-cluster test now passes.

- [ ] **Step 5: Commit the generic graph helper**

```bash
git add src/services/workflowRuntime/modules/grouping/groupingGraph.ts src/services/workflowRuntime/modules/grouping/groupingQueries.ts tests/core/workflow-runtime-grouping.test.cjs
git commit -m "feat: add graph clustering for runtime grouping"
```

### Task 6: Implement burst and variant runtime grouping on top of the graph helper

**Files:**

- Modify: `src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts`
- Modify: `src/services/workflowRuntime/modules/grouping/groupingQueries.ts`
- Modify: `src/services/workflowRuntime/modules/grouping/groupingPersistence.ts`
- Test: `tests/core/workflow-runtime-grouping.test.cjs`

- [ ] **Step 1: Add failing burst and variant integration tests**

```js
test('runtime burst grouping uses time window plus perceptual similarity', async () => {
    seedBurstAssets(dbManager, [
        { id: 'asset-a', exifDate: '2026-01-01T12:00:00.000Z', phash64: 'aaaa' },
        { id: 'asset-b', exifDate: '2026-01-01T12:00:02.000Z', phash64: 'aaab' },
        { id: 'asset-c', exifDate: '2026-01-01T12:05:00.000Z', phash64: 'bbbb' },
    ]);

    await runGroupingWorkflow({
        dbManager,
        inputSubjects: [{ subjectType: 'asset', subjectId: 'asset-b' }],
    });

    assert.equal(countMembersForGroupType(dbManager, 'burst'), 2);
});
```

- [ ] **Step 2: Run the test file to verify burst and variant integration still fail**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: FAIL because the runtime module does not yet persist burst and variant components.

- [ ] **Step 3: Implement impacted-candidate loading and group persistence**

```ts
const burstComponents = buildConnectedComponents(burstNodeIds, burstEdges);
persistSimilarityGroups({
    db,
    type: 'burst',
    components: burstComponents,
    paramsJson: { t_burst: burstWindowSeconds, phashThreshold: burstDistance },
});

const variantComponents = buildConnectedComponents(variantNodeIds, variantEdges);
persistSimilarityGroups({
    db,
    type: 'variant_set',
    components: variantComponents,
    paramsJson: { threshold: variantDistance },
});
```

- [ ] **Step 4: Re-run the full grouping test file**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: PASS across duplicate, cleanup, burst, and variant scenarios.

- [ ] **Step 5: Run staged repo checks for the branch-heavy TypeScript**

Run: `npm run quality:staged`

Expected: PASS

Run: `npm run complexity:staged`

Expected: PASS with grouping functions kept under local guardrails.

- [ ] **Step 6: Commit the burst/variant slice**

```bash
git add src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts src/services/workflowRuntime/modules/grouping/groupingQueries.ts src/services/workflowRuntime/modules/grouping/groupingPersistence.ts tests/core/workflow-runtime-grouping.test.cjs
git commit -m "feat: restore runtime burst and variant grouping"
```

## Chunk 4: Final Verification And Handoff

### Task 7: Run final verification and prepare for execution handoff

**Files:**

- Review: `src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts`
- Review: `src/services/workflowRuntime/modules/grouping/groupingAssetPrep.ts`
- Review: `src/services/workflowRuntime/modules/grouping/groupingQueries.ts`
- Review: `src/services/workflowRuntime/modules/grouping/groupingGraph.ts`
- Review: `src/services/workflowRuntime/modules/grouping/groupingPersistence.ts`
- Review: `tests/core/workflow-runtime-grouping.test.cjs`

- [ ] **Step 1: Run the targeted test file one more time**

Run: `node --test tests/core/workflow-runtime-grouping.test.cjs`

Expected: PASS

- [ ] **Step 2: Run full repository quality checks for the slice**

Run: `npm run quality`

Expected: PASS

- [ ] **Step 3: Inspect the final diff for accidental scope creep**

Run: `git diff --stat HEAD~4..HEAD`

Expected: only grouping module, grouping helpers, and grouping tests are included.

- [ ] **Step 4: Record any residual risks in the handoff note**

```md
- Runtime grouping still depends on hash quality from the existing perceptual hash implementation.
- Burst thresholds remain constant until product tuning work is scheduled.
```

- [ ] **Step 5: Commit any final test-only cleanup if needed**

```bash
git add src/services/workflowRuntime/modules/groupSimilarPhotosModule.ts src/services/workflowRuntime/modules/grouping/*.ts tests/core/workflow-runtime-grouping.test.cjs
git commit -m "test: finalize runtime grouping verification"
```
