#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const MARKER_START = "# codex-quality-gate:start";
const MARKER_END = "# codex-quality-gate:end";

function resolveGitDir(repoRoot) {
  try {
    const commonGitDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();

    if (commonGitDir) {
      return path.resolve(repoRoot, commonGitDir);
    }
  } catch {
    // Fall back to resolving from .git when git is unavailable.
  }

  const dotGitPath = path.join(repoRoot, ".git");
  if (!existsSync(dotGitPath)) {return null;}

  const stats = statSync(dotGitPath);
  if (stats.isDirectory()) {return dotGitPath;}
  if (!stats.isFile()) {return null;}

  const text = readFileSync(dotGitPath, "utf8");
  const match = text.match(/^gitdir:\s*(.+)\s*$/im);
  if (!match) {return null;}
  return path.resolve(repoRoot, match[1]);
}

function buildGateBlock() {
  return `${MARKER_START}
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMRT)

if [ -n "$STAGED_FILES" ]; then
  CODEX_FILE_LIST=$(printf '%s\n' "$STAGED_FILES" | paste -sd, -)

  if ! node tooling/scripts/repo/lint-changed-files.mjs --files "$CODEX_FILE_LIST" --fix --restage; then
    echo "pre-commit: staged autofix failed"
    exit 1
  fi

  if ! node tooling/scripts/repo/lint-changed-files.mjs --files "$CODEX_FILE_LIST"; then
    echo "pre-commit: staged lint failed"
    exit 1
  fi

  if ! node tooling/scripts/repo/complexity-changed-files.mjs --files "$CODEX_FILE_LIST"; then
    echo "pre-commit: staged complexity gate failed"
    exit 1
  fi
fi

if ! npx pnpm run lint:md; then
  echo "pre-commit: markdown lint failed"
  exit 1
fi

if ! npx pnpm run typecheck; then
  echo "pre-commit: typecheck failed"
  exit 1
fi
${MARKER_END}
`;
}

function upsertGate(existing) {
  const block = buildGateBlock();

  if (!existing || existing.trim().length === 0) {
    return `#!/bin/sh
${block}`;
  }

  if (existing.includes(MARKER_START) && existing.includes(MARKER_END)) {
    const regex = new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}\\n?`, "m");
    return existing.replace(regex, block);
  }

  const normalized = existing.endsWith("\n") ? existing : `${existing}\n`;
  return `${normalized}\n${block}`;
}

const repoRoot = process.cwd();
const gitDir = resolveGitDir(repoRoot);

if (!gitDir) {
  console.log("[hooks] .git directory not found. Skipping pre-commit hook install.");
  process.exit(0);
}

const hooksDir = path.join(gitDir, "hooks");
const preCommitPath = path.join(hooksDir, "pre-commit");

mkdirSync(hooksDir, { recursive: true });

const existing = existsSync(preCommitPath) ? readFileSync(preCommitPath, "utf8") : "";
const updated = upsertGate(existing);

writeFileSync(preCommitPath, updated, "utf8");

try {
  chmodSync(preCommitPath, 0o755);
} catch {
  // Best-effort on platforms without POSIX permissions.
}

console.log(`[hooks] Installed pre-commit quality gate at ${preCommitPath}`);
