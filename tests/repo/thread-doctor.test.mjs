import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildThreadDoctorRow,
    buildUntrackedListenerRows,
    parseWindowsNetstatListeners,
} from '../../tooling/scripts/repo/thread-doctor.js';

test('parseWindowsNetstatListeners maps listening ports to owning pids', () => {
    const listeners = parseWindowsNetstatListeners(`
  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       19972
  TCP    127.0.0.1:5174         0.0.0.0:0              LISTENING       28112
  TCP    127.0.0.1:9000         0.0.0.0:0              ESTABLISHED     12345
`);

    assert.deepEqual(listeners, new Map([
        [5173, 19972],
        [5174, 28112],
    ]));
});

test('buildThreadDoctorRow summarizes tracked and live listener state', () => {
    assert.deepEqual(
        buildThreadDoctorRow({
            entry: {
                task: 'Investigate runtime drift',
                status: 'active',
                worktreeName: 'investigate-runtime-drift',
                running: 'dev:desktop-runtime',
            },
            webPort: 6611,
            backendPort: 6612,
            sessionPid: 24568,
            sessionRunning: false,
            listenerMap: new Map([
                [6611, 19972],
            ]),
        }),
        {
            task: 'Investigate runtime drift',
            status: 'active',
            worktreeName: 'investigate-runtime-drift',
            running: 'dev:desktop-runtime',
            url: 'http://localhost:6611',
            backendPort: 6612,
            trackedPid: 24568,
            trackedState: 'stale',
            webPid: 19972,
            backendPid: null,
        },
    );
});

test('buildUntrackedListenerRows reports listeners that do not belong to open thread ports', () => {
    assert.deepEqual(
        buildUntrackedListenerRows({
            listenerMap: new Map([
                [5173, 19972],
                [5174, 28112],
                [6611, 24568],
            ]),
            trackedPorts: new Set([6611]),
        }),
        [
            { port: 5173, pid: 19972 },
            { port: 5174, pid: 28112 },
        ],
    );
});
