import { WebSocket, type WebSocketServer } from 'ws';

export type DevBridgeWebSocket = WebSocket & { isAlive?: boolean; connectionId?: number };

export function getOpenUiConnectionCount(wss: WebSocketServer) {
    let count = 0;
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
            count += 1;
        }
    }
    return count;
}

export function closeSupersededUiConnections(_wss: WebSocketServer, _activeWs: DevBridgeWebSocket) {
    // Multiple dev clients are valid during reloads and browser restarts.
    // Forcing older sockets closed created reconnect loops on the active UI.
}
