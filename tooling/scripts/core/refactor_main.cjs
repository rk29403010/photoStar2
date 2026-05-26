const fs = require('node:fs');
const path = require('node:path');

const mainTsPath = path.join(__dirname, '../src/main.ts');
const handlersTsPath = path.join(__dirname, '../src/handlers.ts');

let mainTs = fs.readFileSync(mainTsPath, 'utf8');

const switchStart = mainTs.indexOf('        switch (command) {');
const switchEnd = mainTs.indexOf('    } catch (err: unknown) {');

if (switchStart === -1 || switchEnd === -1) {
    console.error('Could not find switch block boundaries');
    process.exit(1);
}

const theSwitch = mainTs.substring(switchStart, switchEnd);

// Replace "break;" with "return true;" to exit the handler early
// Wait, the cases are wrapped in blocks, so break exits the switch, then it falls through to the end of handleMessage.
// If we return true, it achieves the same thing.
const modifiedSwitch = theSwitch.replaceAll('break;', 'return true;');

const handlersTsContent = `import { DatabaseManager } from './db';
import { EventBus } from './events/bus';
import { Coordinator } from './coordinator';
import { SystemState } from './state';
import { runScanJob } from './jobs/scan';
import { runPreviewJob } from './jobs/previews';
import { runFaceDetectionJob } from './jobs/detect_faces';
import { runFaceRecognitionJob } from './jobs/recognise_faces';
import { runFaceClusteringJob } from './jobs/cluster_faces';
import { runSensitiveScanJob } from './jobs/scan_sensitive';
import { runAiMetadataJob } from './jobs/get_metadata_ai';
import { DomainEvent } from './events/types';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { WebSocket } from 'ws';

export interface CommandContext {
    id: string;
    command: string;
    payload?: unknown;
    originWs?: WebSocket;
    dbManager: DatabaseManager;
    eventBus: EventBus;
    coordinator: Coordinator;
    activeJobs: Map<string, AbortController>;
    LIB_DIR: string;
    respond: (id: string, status: 'ok' | 'error' | 'event', data: unknown, error: string | null, targetWs?: WebSocket) => void;
}

export function handleSystemCommand(ctx: CommandContext): boolean {
    const { id, command, payload, originWs, dbManager, eventBus, coordinator, activeJobs, LIB_DIR, respond } = ctx;

${modifiedSwitch}
}
`;

fs.writeFileSync(handlersTsPath, handlersTsContent);
console.log('Created handlers.ts');

// Now modify main.ts
const beforeSwitch = mainTs.substring(0, mainTs.indexOf('        let result = null;'));
const afterSwitch = mainTs.substring(switchEnd);

// Add import to handlers.ts at the top
const importStatement = `import { handleSystemCommand } from './handlers';\n`;
mainTs = mainTs.replace(/import { v4 as uuidv4 } from 'uuid';/, `import { v4 as uuidv4 } from 'uuid';\n${importStatement}`);

const newHandleMessageCall = `
        handleSystemCommand({
            id,
            command,
            payload,
            originWs,
            dbManager,
            eventBus,
            coordinator,
            activeJobs,
            LIB_DIR,
            respond
        });
`;

let newMainTs = beforeSwitch + newHandleMessageCall + afterSwitch;

// Remove unused execSync and os imports
newMainTs = newMainTs.replace(/import { execSync } from 'node:child_process';\nimport \* as os from 'node:os';\n/, '');

fs.writeFileSync(mainTsPath, newMainTs);
console.log('Updated main.ts');
