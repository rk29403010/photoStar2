/* eslint-disable deslint/no-prod-console -- devBridgeServer is a dev-only tool, console logging is expected */
import { execSync } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { createServer, type Server, type ServerResponse, type IncomingMessage } from 'node:http';
import * as os from 'node:os';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { closeSupersededUiConnections, getOpenUiConnectionCount, type DevBridgeWebSocket } from './devBridgeWebSocket';
import { formatEventEnvelopeForConsole } from '../../shared/utils/eventLogSummary';

const DEFAULT_WS_PORT = 5174;

type BridgeStatus = 'ok' | 'error' | 'event';

type StartDevBridgeServerOptions = {
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
             
        }
    }
}

function getPortOwners(port: number): number[] {
    if (os.platform() === 'win32') {
        // eslint-disable-next-line sonarjs/os-command, deslint/no-shell-injection -- port is a trusted number, shell execution is required for powershell query
        const output = execSync(`powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess"`, { encoding: "utf8" }).trim();
        return output ? parsePidList(output) : [];
    }

    try {
        // eslint-disable-next-line sonarjs/os-command, deslint/no-shell-injection -- port is a trusted number, shell execution is required for lsof query
        const output = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim();
        return output ? parsePidList(output) : [];
    } catch {
        return [];
    }
}

function getImageRequestLogger(filePath: string) {
    const requestStartedAt = Date.now();
    const fileLabel = path.basename(filePath);
    // eslint-disable-next-line sonarjs/pseudo-random -- non-cryptographic request tracking ID
    const requestId = Math.random().toString(36).slice(2, 8);

    return {
        fileLabel,
        logStart: (message: string) => {
            console.error(`[Dev][Image#${requestId}] ${fileLabel} ${message}`);
        },
        logEnd: (message: string) => {
            console.error(`[Dev][Image#${requestId}] ${fileLabel} ${message} in ${Date.now() - requestStartedAt}ms`);
        },
    };
}

function attachImageResponseLogging(
    stream: ReturnType<typeof createReadStream>,
    res: ServerResponse<IncomingMessage>,
    imageLog: ReturnType<typeof getImageRequestLogger>,
) {
    let completed = false;
    stream.on('open', () => {
        imageLog.logStart('stream opened');
    });
    res.on('finish', () => {
        completed = true;
        imageLog.logEnd(`response finished status=${res.statusCode}`);
    });
    res.on('close', () => {
        if (!completed) {
            imageLog.logEnd(`response aborted status=${res.statusCode}`);
        }
    });
    stream.on('error', (error) => {
        res.writeHead(500);
        res.end('Error reading file');
        imageLog.logEnd(`read error: ${String(error)}`);
    });
}

function streamImageFile(filePath: string, res: ServerResponse<IncomingMessage>) {
    const imageLog = getImageRequestLogger(filePath);
    if (!existsSync(filePath)) {
        imageLog.logEnd('missing file');
        return false;
    }

    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    imageLog.logStart('request received');
    const stream = createReadStream(filePath);
    stream.pipe(res);
    attachImageResponseLogging(stream, res, imageLog);
    return true;
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
                    if (streamImageFile(filePath, res)) {
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

    server.listen(bridgePort, '127.0.0.1', () => {
        console.error(`[Dev] HTTP / WebSocket Bridge listening on port ${bridgePort} (localhost only)`);
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

function logResponderMessage(params: {
    data: unknown;
    error: string | null;
    id: string;
    payloadStr: string;
    shouldUseSummaryOutput: boolean;
    status: BridgeStatus;
}) {
    if (!params.shouldUseSummaryOutput) {
        console.log(params.payloadStr);
        return;
    }

    const formattedEvent = formatEventEnvelopeForConsole({
        id: params.id,
        status: params.status,
        data: params.data,
        error: params.error,
    });

    if (formattedEvent.level === 'error') {
        console.error(formattedEvent.text);
        return;
    }

    if (formattedEvent.level === 'warn') {
        console.warn(formattedEvent.text);
        return;
    }

    console.log(formattedEvent.text);
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
        const shouldUseSummaryOutput = status === 'event' || payloadStr.length > 20000;

        if (!targetWs) {
            logResponderMessage({ id, status, data, error, payloadStr, shouldUseSummaryOutput });
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
