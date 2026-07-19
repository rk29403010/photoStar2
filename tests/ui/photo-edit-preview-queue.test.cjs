const test = require('node:test');
const assert = require('node:assert/strict');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((next, fail) => {
        resolve = next;
        reject = fail;
    });
    return { promise, reject, resolve };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('preview queue starts the first request immediately', async () => {
    const { LatestPreviewQueue } = await import('../../src/ui/components/photo-editor/photoEditPreviewQueue.ts');
    const requests = [];
    const ready = [];
    const queue = new LatestPreviewQueue({
        minimumIntervalMs: 0,
        request: async (input) => {
            requests.push(input);
            return `preview-${input}`;
        },
        callbacks: {
            onError: () => assert.fail('preview should not fail'),
            onQueued: () => undefined,
            onReady: (url) => ready.push(url),
        },
    });

    queue.enqueue(1);
    await flush();

    assert.deepEqual(requests, [1]);
    assert.deepEqual(ready, ['preview-1']);
});

test('debounced preview queue skips stale slider values before starting a render', async () => {
    const { LatestPreviewQueue } = await import('../../src/ui/components/photo-editor/photoEditPreviewQueue.ts');
    const waits = [];
    const requests = [];
    const queue = new LatestPreviewQueue({
        debounceMs: 160,
        minimumIntervalMs: 0,
        request: async (input) => { requests.push(input); return `preview-${input}`; },
        wait: async (milliseconds) => { waits.push(milliseconds); },
        callbacks: { onError: () => assert.fail('preview should not fail'), onQueued: () => undefined, onReady: () => undefined },
    });

    queue.enqueue(1);
    queue.enqueue(8);
    await flush();
    await flush();

    assert.deepEqual(waits, [160, 160]);
    assert.deepEqual(requests, [8]);
});

test('preview queue collapses rapid updates to the latest pending request', async () => {
    const { LatestPreviewQueue } = await import('../../src/ui/components/photo-editor/photoEditPreviewQueue.ts');
    const first = deferred();
    const requests = [];
    const ready = [];
    const queue = new LatestPreviewQueue({
        minimumIntervalMs: 0,
        request: (input) => {
            requests.push(input);
            return input === 0 ? first.promise : Promise.resolve(`preview-${input}`);
        },
        callbacks: {
            onError: () => assert.fail('preview should not fail'),
            onQueued: () => undefined,
            onReady: (url) => ready.push(url),
        },
    });

    queue.enqueue(0);
    for (let value = 1; value <= 30; value += 1) {queue.enqueue(value);}
    assert.deepEqual(requests, [0]);

    first.resolve('preview-0');
    await flush();
    await flush();

    assert.deepEqual(requests, [0, 30]);
    assert.deepEqual(ready, ['preview-30']);
});

test('stale preview failures do not replace feedback for the latest revision', async () => {
    const { LatestPreviewQueue } = await import('../../src/ui/components/photo-editor/photoEditPreviewQueue.ts');
    const first = deferred();
    const errors = [];
    const ready = [];
    const queue = new LatestPreviewQueue({
        minimumIntervalMs: 0,
        request: (input) => input === 'old' ? first.promise : Promise.resolve('latest-url'),
        callbacks: {
            onError: (error) => errors.push(error),
            onQueued: () => undefined,
            onReady: (url) => ready.push(url),
        },
    });

    queue.enqueue('old');
    queue.enqueue('latest');
    first.reject(new Error('stale failure'));
    await flush();
    await flush();

    assert.deepEqual(errors, []);
    assert.deepEqual(ready, ['latest-url']);
});

test('disposing the preview queue prevents in-flight results from reaching the UI', async () => {
    const { LatestPreviewQueue } = await import('../../src/ui/components/photo-editor/photoEditPreviewQueue.ts');
    const request = deferred();
    const ready = [];
    const queue = new LatestPreviewQueue({
        minimumIntervalMs: 0,
        request: () => request.promise,
        callbacks: {
            onError: () => undefined,
            onQueued: () => undefined,
            onReady: (url) => ready.push(url),
        },
    });

    queue.enqueue('preview');
    queue.dispose();
    request.resolve('late-url');
    await flush();

    assert.deepEqual(ready, []);
});
