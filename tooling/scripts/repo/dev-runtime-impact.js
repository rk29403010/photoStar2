#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { classifyRestartImpact, resolveDevRuntimePorts } from './dev-runtime-config.js';

function runGit(gitArgs) {
  const result = spawnSync('git', gitArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  if (result.error || result.status !== 0) {
    const message = (result.stderr || '').trim() || result.error?.message || 'Unknown error';
    throw new Error(`git ${gitArgs.join(' ')} failed: ${message}`);
  }

  return (result.stdout || '').trim();
}

function toLines(text) {
  if (!text) {
    return [];
  }

  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function getExplicitFiles(args) {
  const inlineArg = args.find((arg) => arg.startsWith('--files='));
  if (inlineArg) {
    return inlineArg.slice('--files='.length).split(',').map((line) => line.trim()).filter(Boolean);
  }

  const filesArgIndex = args.findIndex((arg) => arg === '--files');
  if (filesArgIndex !== -1 && args[filesArgIndex + 1]) {
    return args[filesArgIndex + 1].split(',').map((line) => line.trim()).filter(Boolean);
  }

  return [];
}

function getFilesFromArgs(args) {
  const explicitFiles = getExplicitFiles(args);
  if (explicitFiles.length > 0) {
    return explicitFiles;
  }

  if (args.includes('--staged')) {
    return toLines(runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMRT']));
  }

  if (args.includes('--all')) {
    return toLines(runGit(['ls-files']));
  }

  return toLines(runGit(['diff', '--name-only', '--diff-filter=ACMRT', 'HEAD']));
}

function main() {
  const args = process.argv.slice(2);
  const files = getFilesFromArgs(args);
  const impact = classifyRestartImpact(files);
  const ports = resolveDevRuntimePorts(process.env);

  console.log(`[dev-impact] ${impact.summary}`);
  console.log(`[dev-impact] Current dev ports: web=${ports.webPort}, backend=${ports.backendPort}`);

  if (impact.files.length > 0) {
    console.log('[dev-impact] Files considered:');
    for (const filePath of impact.files) {
      console.log(`- ${filePath}`);
    }
  }

  if (impact.reasons.length > 0) {
    console.log('[dev-impact] Reasons:');
    for (const reason of impact.reasons) {
      console.log(`- ${reason}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`[dev-impact] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
