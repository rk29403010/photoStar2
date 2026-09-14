import type { DatabaseManager } from '../../../data/db';
import { generatedSemanticPredicatePlugins } from './generatedSemanticPredicateRegistry';
import type { SemanticPredicateManifest } from './contracts';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

const manifestsByKey = new Map(
    generatedSemanticPredicatePlugins.map((plugin) => [plugin.manifest.key, plugin.manifest]),
);

export function getSemanticPredicateManifest(key: string): SemanticPredicateManifest {
    const manifest = manifestsByKey.get(key);
    if (!manifest) {
        throw new Error(`No active semantic predicate manifest owns '${key}'.`);
    }
    return manifest;
}

export function snapshotSemanticPredicateDefinitions(db: DbHandle): void {
    const upsert = db.prepare(`
        INSERT INTO semantic_predicate_definitions (
            predicate_key, predicate_version, definition_json, status, updated_at
        )
        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
        ON CONFLICT(predicate_key, predicate_version) DO UPDATE SET
            definition_json = excluded.definition_json,
            status = 'active',
            updated_at = CURRENT_TIMESTAMP
    `);
    db.transaction(() => {
        for (const plugin of generatedSemanticPredicatePlugins) {
            upsert.run(plugin.manifest.key, plugin.manifest.version, JSON.stringify(plugin.manifest));
        }
    })();
}
