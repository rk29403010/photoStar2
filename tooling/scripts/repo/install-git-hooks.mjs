#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MARKER_START = "# repo-quality-gate:start";
const MARKER_END = "# repo-quality-gate:end";
const LEGACY_MARKER_START = "# codex-quality-gate:start";
const LEGACY_MARKER_END = "# codex-quality-gate:end";

function resolveGitDir(repoRoot) {
  const dotGitPath = path.join(repoRoot, ".git");
  if (!existsSync(dotGitPath)) {return null;}

  const stats = statSync(dotGitPath);
  if (stats.isDirectory()) {return dotGitPath;}
  if (!stats.isFile()) {return null;}

  const text = readFileSync(dotGitPath, "utf8");
  const gitDirLine = text.split(/\r?\n/u).find((line) => line.toLowerCase().startsWith("gitdir:"));
  if (!gitDirLine) {return null;}
  const worktreeGitDir = path.resolve(repoRoot, gitDirLine.slice("gitdir:".length).trim());
  const commonDirFile = path.join(worktreeGitDir, "commondir");
  if (!existsSync(commonDirFile)) {return worktreeGitDir;}

  const commonDir = readFileSync(commonDirFile, "utf8").trim();
  return commonDir ? path.resolve(worktreeGitDir, commonDir) : worktreeGitDir;
}

export function buildGateBlock() {
  return `${MARKER_START}
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ] || ! cd "$REPO_ROOT"; then
  echo "pre-commit: could not resolve the current worktree root"
  exit 1
fi

has_package_script() {
  node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));process.exit(p.scripts&&p.scripts[process.argv[1]]?0:1)" "$1"
}

run_package_script() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm run "$1"
  elif command -v pnpm.cmd >/dev/null 2>&1; then
    pnpm.cmd run "$1"
  else
    echo "pre-commit: pnpm is unavailable; install the package manager declared by package.json"
    return 1
  fi
}

if has_package_script "qa:quick"; then
  GATE_SCRIPT="qa:quick"
elif has_package_script "quality:staged"; then
  GATE_SCRIPT="quality:staged"
else
  echo "pre-commit: this worktree exposes neither qa:quick nor quality:staged"
  exit 1
fi

if ! run_package_script "$GATE_SCRIPT"; then
  echo "pre-commit: $GATE_SCRIPT failed"
  exit 1
fi
${MARKER_END}
`;
}

function replaceMarkedBlock(existing, start, end, block) {
  const startIndex = existing.indexOf(start);
  const endIndex = existing.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < startIndex) {return existing;}

  const afterMarker = endIndex + end.length;
  const suffixIndex = existing.startsWith("\r\n", afterMarker)
    ? afterMarker + 2
    : afterMarker + Number(existing.startsWith("\n", afterMarker));
  return `${existing.slice(0, startIndex)}${block}${existing.slice(suffixIndex)}`;
}

export function upsertGate(existing) {
  const block = buildGateBlock();

  if (!existing || existing.trim().length === 0) {
    return `#!/bin/sh
${block}`;
  }

  if (existing.includes(MARKER_START) && existing.includes(MARKER_END)) {
    return replaceMarkedBlock(existing, MARKER_START, MARKER_END, block);
  }

  if (existing.includes(LEGACY_MARKER_START) && existing.includes(LEGACY_MARKER_END)) {
    return replaceMarkedBlock(existing, LEGACY_MARKER_START, LEGACY_MARKER_END, block);
  }

  const normalized = existing.endsWith("\n") ? existing : `${existing}\n`;
  return `${normalized}\n${block}`;
}

export function installGitHook(repoRoot = process.cwd()) {
  const gitDir = resolveGitDir(repoRoot);

  if (!gitDir) {
    console.log("[hooks] .git directory not found. Skipping pre-commit hook install.");
    return;
  }

  const hooksDir = path.join(gitDir, "hooks");
  const preCommitPath = path.join(hooksDir, "pre-commit");

  mkdirSync(hooksDir, { recursive: true });

  const existing = existsSync(preCommitPath) ? readFileSync(preCommitPath, "utf8") : "";
  const updated = upsertGate(existing);

  writeFileSync(preCommitPath, updated, "utf8");

  try {
    chmodSync(preCommitPath, 0o755);
  } catch (error) {
    console.warn(`[hooks] Could not mark pre-commit executable: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`[hooks] Installed pre-commit quality gate at ${preCommitPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installGitHook();
}
