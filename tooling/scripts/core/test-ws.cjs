const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:5174');

ws.on('open', () => {
    console.log('Connected.');
    ws.send(JSON.stringify({ id: 'assets-init', command: 'get_assets', payload: { limit: 5 } }) + '\n');
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Received response:', msg.id, msg.status);
    process.exit(0);
});

ws.on('error', (err) => {
    console.error('Error:', err);
    process.exit(1);
});
