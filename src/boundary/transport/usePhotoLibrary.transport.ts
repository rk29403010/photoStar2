import type { Child } from '@tauri-apps/plugin-shell';

type MessageStream = {
    on: (event: 'data', listener: (chunk: string) => void) => void;
    removeListener: (event: 'data', listener: (chunk: string) => void) => void;
};

interface RequestMessage {
    id?: string;
    status?: string;
    error?: string;
    data?: Record<string, unknown>;
}

interface RequestArgs<T> {
    idPrefix: string;
    command: string;
    payload?: Record<string, unknown>;
    timeoutMs?: number;
    select?: (data: Record<string, unknown> | undefined) => T;
}

interface BaseBackendTransport {
    kind: 'tauri' | 'ws';
    write: (data: string) => Promise<void>;
}

export interface TauriBackendTransport extends BaseBackendTransport {
    kind: 'tauri';
    child: Child;
    stdout: MessageStream;
}

export interface WebSocketBackendTransport extends BaseBackendTransport {
    kind: 'ws';
    socket: WebSocket;
}

export type BackendTransport = TauriBackendTransport | WebSocketBackendTransport;

export type RequestFn = <T>(args: {
    idPrefix: string;
    command: string;
    payload?: Record<string, unknown>;
    timeoutMs?: number;
    select?: (data: Record<string, unknown> | undefined) => T;
}) => Promise<T>;

function parseRequestMessage(rawMessage: string): RequestMessage | null {
    try {
        return JSON.parse(rawMessage) as RequestMessage;
    } catch {
        return null;
    }
}

export function createStreamLineHandler(onLine: (line: string) => void) {
    let buffer = '';

    return (chunk: string) => {
        buffer += chunk;
        let lineEnd = buffer.indexOf('\n');
        while (lineEnd !== -1) {
            const line = buffer.slice(0, lineEnd).trim();
            buffer = buffer.slice(lineEnd + 1);
            if (line) {onLine(line);}
            lineEnd = buffer.indexOf('\n');
        }

        const maybeSingleLine = buffer.trim();
        if (maybeSingleLine.startsWith('{') && maybeSingleLine.endsWith('}')) {
            onLine(maybeSingleLine);
            buffer = '';
        }
    };
}

export function createWebSocketBackendTransport(socket: WebSocket): WebSocketBackendTransport {
    return {
        kind: 'ws',
        socket,
        write: async (data: string) => {
            if (socket.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not connected');
            }
            socket.send(data);
        },
    };
}

export function createTauriBackendTransport(child: Child, stdout: MessageStream): TauriBackendTransport {
    return {
        kind: 'tauri',
        child,
        stdout,
        write: (data: string) => child.write(data),
    };
}

function handleWsRequest<T>(
    transport: WebSocketBackendTransport,
    id: string,
    command: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
    select: (data: Record<string, unknown> | undefined) => T
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            transport.socket.removeEventListener('message', onMessage);
            reject(new Error(`Timeout for ${command}`));
        }, timeoutMs);

        const onMessage = (event: MessageEvent) => {
            const msg = parseRequestMessage(String(event.data));
            if (!msg || msg.id !== id) {return;}

            clearTimeout(timeout);
            transport.socket.removeEventListener('message', onMessage);
            if (msg.status === 'ok') {resolve(select(msg.data));}
            else {reject(new Error(msg.error || `Failed ${command}`));}
        };

        transport.socket.addEventListener('message', onMessage);
        void transport.write(JSON.stringify({ id, command, payload }) + '\n').catch((err) => {
            clearTimeout(timeout);
            transport.socket.removeEventListener('message', onMessage);
            reject(err);
        });
    });
}

function handleChildRequest<T>(
    transport: TauriBackendTransport,
    id: string,
    command: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
    select: (data: Record<string, unknown> | undefined) => T
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            transport.stdout.removeListener('data', onData);
            reject(new Error(`Timeout for ${command}`));
        }, timeoutMs);

        const onData = createStreamLineHandler((line: string) => {
            const msg = parseRequestMessage(line);
            if (!msg || msg.id !== id) {return;}

            clearTimeout(timeout);
            transport.stdout.removeListener('data', onData);
            if (msg.status === 'ok') {resolve(select(msg.data));}
            else {reject(new Error(msg.error || `Failed ${command}`));}
        });

        transport.stdout.on('data', onData);
        transport.write(JSON.stringify({ id, command, payload }) + '\n').catch((err) => {
            clearTimeout(timeout);
            transport.stdout.removeListener('data', onData);
            reject(err);
        });
    });
}

export async function requestWithChannels<T>(
    transport: BackendTransport | null,
    { idPrefix, command, payload = {}, timeoutMs = 5000, select = (data) => data as T }: RequestArgs<T>
): Promise<T> {
    const id = `${idPrefix}_${Date.now()}`;
    if (!transport) {
        throw new Error('Backend service not ready');
    }

    if (transport.kind === 'ws') {
        return handleWsRequest(transport, id, command, payload, timeoutMs, select);
    }

    return handleChildRequest(transport, id, command, payload, timeoutMs, select);
}

export function createRequestFn(transport: BackendTransport | null): RequestFn {
    return async function request<T>(args: {
        idPrefix: string;
        command: string;
        payload?: Record<string, unknown>;
        timeoutMs?: number;
        select?: (data: Record<string, unknown> | undefined) => T;
    }): Promise<T> {
        return requestWithChannels(transport, args);
    };
}

export async function writeCommand(transport: BackendTransport | null, id: string, command: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (!transport) {return;}
    await transport.write(JSON.stringify({ id, command, payload }) + '\n');
}
