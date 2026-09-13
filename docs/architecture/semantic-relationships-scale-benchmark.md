# Semantic relationships scale benchmark

This WP16a harness measures active face-vector retrieval without using archive
data. It seeds a disposable SQLite database and removes it when finished.

| Tier | Assets/faces represented | 512-d vectors | Raw vector bytes |
| --- | ---: | ---: | ---: |
| development | 10k / 20k | 20k | about 40 MiB |
| target | 100k / 250k | 250k | about 488 MiB |
| stretch | 500k / 1m | 1m | about 1.9 GiB |

Run `pnpm.cmd run build:core` first. Then run one tier at a time:

```powershell
node.exe tooling/scripts/repo/wp11d-vector-benchmark.cjs --tier=development
node.exe tooling/scripts/repo/wp11d-vector-benchmark.cjs --tier=target
node.exe tooling/scripts/repo/wp11d-vector-benchmark.cjs --tier=stretch
```

The output is a `WP11D_BENCHMARK_RESULT` JSON record containing setup time,
minimum/maximum/p95 lookup latency and process heap growth. Record hardware,
Node version and SQLite database growth alongside that record before comparing
runs. The target is p95 below 150 ms. A miss is evidence to evaluate a local
vector index; it is not permission to weaken the latency or memory contract.

The harness is intentionally vector-only. WP16b and WP16d must add the
corresponding library-presentation, projection-rebuild and SQLite-growth
measurements before Phase 1 can close.

## Library presentation page

The exact-copy presentation benchmark seeds four copies per item and measures
the existing first-page query, including its full-table grouping work:

```powershell
node.exe tooling/scripts/repo/semantic-library-presentation-benchmark.cjs --tier=development
node.exe tooling/scripts/repo/semantic-library-presentation-benchmark.cjs --tier=target
node.exe tooling/scripts/repo/semantic-library-presentation-benchmark.cjs --tier=stretch
```

Its JSON record includes p50/p95, seed time and SQLite size. Measure capture
sequence expansion and bulk selection separately before declaring WP16b
complete.

On 2026-09-13, the `assets(file_hash)` index brought the development fixture to
119.0 ms p95, but target tier remained 1123.6 ms p95. Numbered migration
`20260913_003_exact_copy_presentation_cache` adds a rebuildable cache with an
Asset-change dirty marker and transactional refresh on the next read. The warmed
target fixture then measured 54.1 ms p95 at 100k Assets (22.9 MiB SQLite), below
the 150 ms target. Offset 10,000 measured 91.9 ms p95; first materialization
took 1131.0 ms. Measure stretch paging before closing the presentation paging
requirement.

The stretch fixture (500k Assets, page offset 50,000) measured 993.8 ms p95 and
6187.4 ms first materialization at 115.2 MiB SQLite before the cached chronology
index. Migration `20260913_004_exact_copy_presentation_cache_order` reduced the
target offset-10,000 page to 18.2 ms p95 and the stretch offset-50,000 page to
62.3 ms p95. The 500k-Asset cache materialization cost is 6745.4 ms at 125.0
MiB SQLite; retain it as an explicit rebuild operation rather than an interaction
path.

The capture-sequence projection benchmark measures the complete composed
presentation rather than a synthetic read shortcut. At development tier (10k
Assets / 2.5k sequences), warmed paging measured 0.8 ms p95 and rebuild took
1025.6 ms. At target tier (100k Assets / 25k sequences), warmed paging measured
1.2 ms p95 and rebuild took 11395.1 ms. The tracked grouping workflow now owns
that rebuild after successful proposal replacement, while reads retain the last
successful projection during invalidation.

The target-tier selection benchmark uses 100k visible presentation items. Lazy
range selection previously measured 68.0 ms p95 and deferred bulk expansion
84.8 ms. A compatibility/order correction retained the established contract
that individual photo IDs precede expanded presentation members; the rerun on
2026-09-14 measured 65.4 ms p95 selection and 73.9 ms expansion. Both paths
remain below the 150 ms interaction target.

## Face candidates and cluster reconciliation

The WP16c harness seeds five candidate rows per face, exercises the real
`get_person_face_candidates` command query, and reconciles four-face machine
clusters at development and target scale:

```powershell
node.exe tooling/scripts/repo/semantic-face-performance-benchmark.cjs --tier=development
node.exe tooling/scripts/repo/semantic-face-performance-benchmark.cjs --tier=target
```

On 2026-09-14, the development fixture (20k faces / 100k candidates / 5k
clusters) measured 6.5 ms p95 candidate lookup and 97.2 ms whole-cluster
reconciliation. The target fixture (250k faces / 1.25m candidates / 62.5k
clusters) measured 57.7 ms p95 candidate lookup and 858.4 ms whole-cluster
reconciliation, with a 541.6 MiB SQLite fixture. Target reconciliation used
118.7 MiB observed heap growth.

The prior pairwise reconciliation algorithm took 66035 ms for only 5k
four-face clusters. Indexing candidate clusters by stable Face membership
reduced that same development-scale operation to 79-97 ms without changing the
mutual unique-best overlap contract. This removes the quadratic scale blocker.

The separate active-vector benchmark remains authoritative for exact vector
retrieval. Its 250k by 512-d target result (2334.8 ms p95) misses the 150 ms
interaction target and therefore requires a local vector-index proposal before
candidate generation can be treated as interactive. Candidate review lookup
and cluster reconciliation do not require that index and meet their respective
read/whole-rebuild expectations.

## Projection, storage and compaction matrix

| Target-tier path | Result | Memory / SQLite evidence | Execution class |
| --- | ---: | ---: | --- |
| Exact-copy page, offset 10k | 18.2 ms p95 | 24.7 MiB SQLite | Interaction |
| Exact-copy cache rebuild, 500k stretch | 6745.4 ms | 125.0 MiB SQLite | Tracked rebuild |
| Capture page, 25k sequences | 1.2 ms p95 | Included in target fixture | Interaction |
| Capture projection rebuild, 25k sequences | 11395.1 ms | Included in target fixture | Tracked workflow rebuild |
| Candidate review, 1.25m candidates | 57.7 ms p95 | 541.6 MiB SQLite | Interaction |
| IdentityCluster reconcile, 62.5k clusters | 858.4 ms | 118.7 MiB heap growth | Whole projection rebuild |
| Exact vector lookup, 250k by 512-d | 2334.8 ms p95 | About 488 MiB raw vectors | Index follow-up; not interactive |

The generation-compaction harness creates three complete 512-d vector
generations per scope, protects the active generation and its immediate
predecessor, compacts the oldest BLOBs through the production maintenance path,
then measures explicit SQLite reclamation:

```powershell
node.exe tooling/scripts/repo/semantic-generation-compaction-benchmark.cjs --tier=development
node.exe tooling/scripts/repo/semantic-generation-compaction-benchmark.cjs --tier=target
```

On 2026-09-14, development tier started with 60k vectors / 247.2 MiB, deleted
20k vectors in 1508.2 ms, retained 40k, and reclaimed the file to 164.9 MiB in
2162.6 ms. Target tier started with 750k vectors / 3070.4 MiB, deleted 250k
vectors in 24754.3 ms, retained the required active-plus-predecessor 500k, and
reclaimed the file to 2040.1 MiB in 40915.8 ms. Compaction heap growth was 0.7
MiB at target. SQLite does not return deleted pages to the filesystem until the
explicit `VACUUM`; both operations are maintenance work, not interaction paths.
