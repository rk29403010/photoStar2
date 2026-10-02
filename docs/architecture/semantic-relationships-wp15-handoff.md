# WP15 continuation handoff

WP15 completed and was published as `06d7c44` on
`task/semantic-relationships-phase1-foundation`. The local `qa:ready` and
`qa:merge` gates passed at that head. Do not use Sonar results from the prior
PR head (`5ec67ec`) to assess this checkpoint.

The active reset contract is
`semantic-relationships-reset-durability-matrix.md`. Its executable fixtures
are the `tests/core/wp15-*.test.cjs` files plus WP13e and WP10f durability
coverage. The implementation uses `src/data/assetIdentityRepository.ts` for
safe identity binding: an existing path needs matching hash and size, a moved
file requires one detached match, and ambiguity creates a new identity.

Continue with WP16a. Check PR #42 CI and Sonar against `06d7c44` once the
new-run status is available; separate newly introduced findings from the
pre-existing PR baseline.
