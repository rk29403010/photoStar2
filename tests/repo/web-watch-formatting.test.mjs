import test from 'node:test';
import assert from 'node:assert/strict';

import { createPrefixedOutputHandler } from '../../tooling/scripts/web/dev-watch.js';

test('web watch prefixes each Vite log line with a stable label', () => {
    let output = '';
    const handleOutput = createPrefixedOutputHandler({
        write: (text) => {
            output += text;
        },
    });

    handleOutput(Buffer.from([
        'VITE v5.4.21  ready in 4289 ms',
        '  Local:   http://localhost:5173/',
        '  Network: http://192.168.0.117:5173/',
        '',
    ].join('\n')));

    assert.match(output, /VITE v5\.4\.21 {2}ready in 4289 ms/);
    assert.match(output, /\[web-watch\].*Local: {3}http:\/\/localhost:5173\//s);
    assert.match(output, /\[web-watch\].*Network: http:\/\/192\.168\.0\.117:5173\//s);
});
