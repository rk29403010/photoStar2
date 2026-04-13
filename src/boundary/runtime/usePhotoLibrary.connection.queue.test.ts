/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueuedMessageProcessor } from './usePhotoLibrary.connection.queue.ts';

void test('createQueuedMessageProcessor defers work and preserves message order across batches', () => {
    const processed: string[] = [];
    const scheduledFlushes: Array<() => void> = [];
    const processor = createQueuedMessageProcessor({
        processMessage: (message) => processed.push(message),
        batchSize: 2,
        scheduleFlush: (flush) => {
            scheduledFlushes.push(flush);
        },
    });

    processor.enqueue('first');
    processor.enqueue('second');
    processor.enqueue('third');

    assert.deepEqual(processed, []);
    assert.equal(scheduledFlushes.length, 1);

    scheduledFlushes.shift()?.();

    assert.deepEqual(processed, ['first', 'second']);
    assert.equal(scheduledFlushes.length, 1);

    scheduledFlushes.shift()?.();

    assert.deepEqual(processed, ['first', 'second', 'third']);
    assert.equal(scheduledFlushes.length, 0);
});

void test('createQueuedMessageProcessor drops queued work after cancellation', () => {
    const processed: string[] = [];
    const scheduledFlushes: Array<() => void> = [];
    const processor = createQueuedMessageProcessor({
        processMessage: (message) => processed.push(message),
        scheduleFlush: (flush) => {
            scheduledFlushes.push(flush);
        },
    });

    processor.enqueue('discard-me');
    processor.cancel();

    assert.equal(scheduledFlushes.length, 1);
    scheduledFlushes.shift()?.();

    assert.deepEqual(processed, []);

    processor.enqueue('ignored-after-cancel');
    assert.deepEqual(processed, []);
    assert.equal(scheduledFlushes.length, 0);
});
