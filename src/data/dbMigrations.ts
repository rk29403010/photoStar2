import type { NumberedMigration } from './migrationLedger';

/**
 * New migrations go here. Unlike the legacy best-effort migration list, these
 * migrations are checksummed, transactional and fail fast.
 *
 * Keep the list append-only. Never edit a migration after it has shipped.
 */
export const NUMBERED_MIGRATIONS: readonly NumberedMigration[] = [];
