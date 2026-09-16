const test = require('node:test');
const assert = require('node:assert/strict');

test('data stats reports active photos without a photo date', async () => {
    const queries = [];
    const db = {
        prepare(sql) {
            queries.push(sql);
            return {
                get() {
                    if (sql.includes('binned_at IS NULL') && sql.includes('photo_created_at IS NULL')) {
                        return { count: 7 };
                    }
                    if (sql === 'SELECT COUNT(*) as count FROM assets') {
                        return { count: 20 };
                    }
                    return { count: 0 };
                },
                all() {
                    return [];
                },
            };
        },
    };

    const { getDataStats } = await import('../../src/services/handlers/systemJobsDataStats.ts');
    const stats = getDataStats(db);

    assert.equal(stats.totals.assets, 20);
    assert.equal(stats.totals.photosWithoutDate, 7);
    assert.ok(queries.some((sql) => sql.includes('binned_at IS NULL') && sql.includes('photo_created_at IS NULL')));
});
