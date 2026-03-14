import { execSync } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import * as os from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { closeSupersededUiConnections, getOpenUiConnectionCount, type DevBridgeWebSocket } from './devBridgeWebSocket';
import { summarizeForEventLog } from '../../shared/utils/eventLogSummary';

const DEFAULT_WS_PORT = 5174;

type BridgeStatus = 'ok' | 'error' | 'event';

interface StartDevBridgeServerOptions {
    onMessage: (line: string, originWs?: WebSocket) => void;
    onReady?: () => void;
}

function getBridgePort(): number {
    const rawValue = process.env.VITE_BACKEND_PORT;
    if (!rawValue || !/^\d+$/.test(rawValue.trim())) {
        return DEFAULT_WS_PORT;
    }

    const parsedPort = Number.parseInt(rawValue, 10);
    return parsedPort >= 1 && parsedPort <= 65_535 ? parsedPort : DEFAULT_WS_PORT;
}

function parsePidList(output: string): number[] {
    return output.split('\n')
        .map((pid) => Number.parseInt(pid.trim(), 10))
        .filter((pid) => !Number.isNaN(pid) && pid !== process.pid);
}

function killForeignProcesses(pids: number[]) {
    const port = getBridgePort();
    for (const pid of pids) {
        console.error(`[Dev] Port ${port} held by alien PID ${pid}. Executing targeted kill...`);
        try {
            process.kill(pid, 9);
        } catch {
            // Ignore targeted kill failures during recovery.
        }
    }
}

function getPortOwners(port: number): number[] {
    if (os.platform() === 'win32') {
        const output = execSync(`powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess"`, { encoding: "utf8" }).trim();
        return output ? parsePidList(output) : [];
    }

    try {
        const output = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim();
        return output ? parsePidList(output) : [];
    } catch {
        return [];
    }
}

function createImageServer() {
    return createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.url?.startsWith('/image?path=')) {
            try {
                const pathParam = req.url.split('path=')[1];
                if (pathParam) {
                    const filePath = decodeURIComponent(pathParam);
                    if (existsSync(filePath)) {
                        const ext = filePath.split('.').pop()?.toLowerCase() || '';
                        const mimeTypes: Record<string, string> = {
                            png: 'image/png',
                            jpg: 'image/jpeg',
                            jpeg: 'image/jpeg',
                            webp: 'image/webp',
                            gif: 'image/gif',
                        };
                        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
                        const stream = createReadStream(filePath);
                        stream.pipe(res);
                        stream.on('error', () => {
                            res.writeHead(500);
                            res.end('Error reading file');
                        });
                        return;
                    }
                }
            } catch (error) {
                console.error('Image serve error:', error);
            }

            res.writeHead(404);
            res.end('Not found');
            return;
        }

        res.writeHead(404);
        res.end();
    });
}

function createPortRetryHandler(server: Server) {
    let listenRetries = 5;

    const retryServerListen = (port: number) => {
        setTimeout(() => {
            server.close();
            server.listen(port);
        }, 1000);
    };

    return (port: number) => {
        console.error(`[Dev] Port ${port} in use. Retrying in 1s... (${listenRetries} attempts left)`);
        listenRetries -= 1;
        if (listenRetries <= 0) {
            console.error('[CRITICAL] Failed to bind port after 5 attempts.');
            process.exit(1);
        }

        try {
            killForeignProcesses(getPortOwners(port));
        } catch {
            // Ignore sweeping errors to let the natural retry loop continue.
        }
        retryServerListen(port);
    };
}

function registerServerLifecycle(server: Server, wss: WebSocketServer, onReady?: () => void) {
    const bridgePort = getBridgePort();
    const handlePortInUseError = createPortRetryHandler(server);

    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            handlePortInUseError(bridgePort);
            return;
        }
        console.error('[CRITICAL] Server error:', err);
    });

    wss.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code !== 'EADDRINUSE') {
            console.error('[Dev] WebSocket Server error:', err);
        }
    });

    server.listen(bridgePort, '0.0.0.0', () => {
        console.error(`[Dev] HTTP / WebSocket Bridge listening on port ${bridgePort} (all interfaces)`);
        onReady?.();
    });

    process.on('exit', (code) => {
        console.error(`[Process Debug] Node process exiting with code: ${code}`);
    });
}

function startHeartbeatMonitor(wss: WebSocketServer) {
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            const client = ws as DevBridgeWebSocket;
            if (client.isAlive === false) {
                console.error(`[Dev][WS#${client.connectionId ?? 'unknown'}] Terminating dead WebSocket connection`);
                client.terminate();
                return;
            }
            client.isAlive = false;
            client.ping();
        });
    }, 30000);

    wss.on('close', () => {
        clearInterval(heartbeatInterval);
    });
}

function registerWebSocketConnections(
    wss: WebSocketServer,
    onMessage: (line: string, originWs?: WebSocket) => void
) {
    let nextDevConnectionId = 1;

    wss.on('connection', (ws, req) => {
        const client = ws as DevBridgeWebSocket;
        client.connectionId = nextDevConnectionId++;
        client.isAlive = true;

        closeSupersededUiConnections(wss, client);
        console.error(`[Dev][WS#${client.connectionId}] UI connected via WebSocket from ${req.socket.remoteAddress ?? 'unknown'} (active: ${getOpenUiConnectionCount(wss)})`);

        client.on('pong', () => {
            client.isAlive = true;
        });

        client.on('close', (code, reason) => {
            const reasonText = reason.length > 0 ? reason.toString() : 'no reason';
            console.error(`[Dev][WS#${client.connectionId}] UI disconnected (code=${code}, reason=${reasonText}, active: ${getOpenUiConnectionCount(wss)})`);
        });

        client.on('message', (message: Buffer) => {
            const line = message.toString().trim();
            if (!line) {
                return;
            }
            onMessage(line, client);
        });

        client.on('error', (error) => {
            console.error(`[Dev][WS#${client.connectionId}] WebSocket error:`, error);
        });
    });
}

function createResponder(wss: WebSocketServer) {
    return (
        id: string,
        status: BridgeStatus,
        data: unknown = null,
        error: string | null = null,
        targetWs?: WebSocket
    ) => {
        const payloadStr = JSON.stringify({ id, status, data, error });
        const shouldUseSummaryOutput = process.stdout.isTTY && (status === 'event' || payloadStr.length > 20000);

        if (!targetWs) {
            if (shouldUseSummaryOutput) {
                console.log(JSON.stringify({
                    id,
                    status,
                    data: summarizeForEventLog(data),
                    error,
                }));
            } else {
                console.log(payloadStr);
            }
        }

        if (targetWs?.readyState === WebSocket.OPEN) {
            targetWs.send(payloadStr);
            return;
        }

        for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payloadStr);
            }
        }
    };
}

function registerShutdown(server: Server, wss: WebSocketServer) {
    const shutdown = () => {
        console.log('[Dev] Shutdown signal received. Closing servers...');
        wss.close();
        server.close(() => {
            console.log('[Dev] HTTP/WS Server closed. Exiting.');
            process.exit(0);
        });
        setTimeout(() => {
            console.log('[Dev] Shutdown timed out. Forcing exit.');
            process.exit(1);
        }, 2000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

export function startDevBridgeServer(options: StartDevBridgeServerOptions) {
    const server = createImageServer();
    const wss = new WebSocketServer({ server });
    registerServerLifecycle(server, wss, options.onReady);
    startHeartbeatMonitor(wss);
    registerWebSocketConnections(wss, options.onMessage);
    registerShutdown(server, wss);

    return {
        respond: createResponder(wss),
    };
}
