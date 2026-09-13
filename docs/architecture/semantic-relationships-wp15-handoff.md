# WP15 continuation handoff

WP15 currently exists as one uncommitted integration checkpoint on
`task/semantic-relationships-phase1-foundation`. Do not reset, clean, stash,
or overwrite the recovered working tree.

The active reset contract is
`semantic-relationships-reset-durability-matrix.md`. Its executable fixtures
are the `tests/core/wp15-*.test.cjs` files plus WP13e and WP10f durability
coverage. The implementation uses `src/data/assetIdentityRepository.ts` for
safe identity binding: an existing path needs matching hash and size, a moved
file requires one detached match, and ambiguity creates a new identity.

Before a handoff or publication, run `pnpm.cmd run qa:ready`, inspect the full
working-tree diff and task state, commit only the WP15-owned files, then run
`pnpm.cmd run qa:merge` at the exact committed head. Check PR #42 and CI only
after those local gates pass.
