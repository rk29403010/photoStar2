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
