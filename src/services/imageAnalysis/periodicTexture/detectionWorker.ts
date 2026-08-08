import { parentPort, workerData } from 'node:worker_threads';
import { detectPeriodicTexture, type PeriodicTextureWorkerRequest } from './detection.ts';

if (!parentPort) {
    throw new Error('Periodic texture worker requires a parent message port.');
}

const request = workerData as PeriodicTextureWorkerRequest;
parentPort.postMessage(detectPeriodicTexture(request.image, request.options), []);
