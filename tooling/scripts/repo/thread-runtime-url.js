#!/usr/bin/env node
import { resolveDevRuntimePorts } from './dev-runtime-config.js';

const { webPort, backendPort } = resolveDevRuntimePorts(process.env, process.cwd());

console.log(`http://localhost:${webPort}`);
console.log(`backend:${backendPort}`);
