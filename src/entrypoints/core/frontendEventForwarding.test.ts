/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldForwardEventToFrontend } from './frontendEventForwarding.ts';

void test('shouldForwardEventToFrontend skips generic AssetUpdated events', () => {
    assert.equal(
        shouldForwardEventToFrontend({
            type: 'AssetUpdated',
            assetId: 'asset-1',
        }),
        false,
    );
});

void test('shouldForwardEventToFrontend still forwards other domain events', () => {
    assert.equal(
        shouldForwardEventToFrontend({
            type: 'JobCompleted',
            jobId: 'job-1',
            pipelineStage: 'scan',
        }),
        true,
    );
});
