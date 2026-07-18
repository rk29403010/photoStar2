#!/usr/bin/env node

import { buildReport } from "./complexity-report.js";
import { resolveComplexityThresholds } from "./quality-policy.js";
import { selectQualityFiles } from "./quality-file-selection.js";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
function resolveMode() {
  if (args.has("--staged")) {
    return "staged";
  }
  return args.has("--all") ? "all" : "changed";
}

const mode = resolveMode();
const explicitFilesArgIndex = process.argv.findIndex((arg) => arg === "--files");
const explicitFilesInline = process.argv.find((arg) => arg.startsWith("--files="));
const typescriptExtensions = new Set([".ts", ".tsx"]);
const thresholds = resolveComplexityThresholds();

function runGit(gitArgs) {
  // Git is an operator-installed prerequisite, so PATH lookup is intentional here.
  const result = spawnSync(process.platform === "win32" ? "git.exe" : "git", gitArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error || result.status !== 0) {
    const message = (result.stderr || "").trim() || result.error?.message || "Unknown error";
    throw new Error(`git ${gitArgs.join(" ")} failed: ${message}`);
  }

  return result.stdout || "";
}

function getExplicitFiles() {
  if (explicitFilesInline) {
    return explicitFilesInline.slice("--files=".length).split(",").map((line) => line.trim()).filter(Boolean);
  }

  if (explicitFilesArgIndex !== -1 && process.argv[explicitFilesArgIndex + 1]) {
    return process.argv[explicitFilesArgIndex + 1].split(",").map((line) => line.trim()).filter(Boolean);
  }

  return [];
}

function getCandidateFiles() {
  const explicitFiles = getExplicitFiles();
  if (explicitFiles.length > 0) {
    return explicitFiles;
  }

  return selectQualityFiles({
    mode,
    diffBase: process.env.LINT_DIFF_BASE,
    githubBaseRef: process.env.GITHUB_BASE_REF,
    runGit,
  });
}

let candidateFiles;
try {
  candidateFiles = getCandidateFiles();
} catch (error) {
  console.error(`[complexity-changed] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const filesToCheck = candidateFiles.filter((filePath) => {
  return typescriptExtensions.has(path.extname(filePath).toLowerCase()) && existsSync(filePath);
});

if (filesToCheck.length === 0) {
  console.log(`[complexity-changed] No TypeScript ${mode} files.`);
  process.exit(0);
}

const parsed = buildReport({
  dirs: [],
  top: Math.max(1, filesToCheck.length * 50),
  minCyclomatic: 0,
  minCognitive: 0,
  json: true,
  files: filesToCheck,
});
const rows = Array.isArray(parsed.top) ? parsed.top : [];
const failures = rows.filter((row) => {
  return row.cyclomatic > thresholds.maxCyclomatic
    || row.cognitiveApprox > thresholds.maxCognitive
    || row.loc > thresholds.maxLoc;
});

if (failures.length === 0) {
  console.log(
    `[complexity-changed] ${filesToCheck.length} file(s) checked. No changed functions exceeded cyclomatic>${thresholds.maxCyclomatic}, cognitive>${thresholds.maxCognitive}, loc>${thresholds.maxLoc}.`
  );
  process.exit(0);
}

console.error("[complexity-changed] Changed files contain overly complex functions:");
for (const row of failures) {
  console.error(
    `- ${row.file}:${row.line} ${row.name} (cyc:${row.cyclomatic}, cog:${row.cognitiveApprox}, loc:${row.loc})`
  );
}
console.error(
  `[complexity-changed] Limits: cyclomatic<=${thresholds.maxCyclomatic}, cognitive<=${thresholds.maxCognitive}, loc<=${thresholds.maxLoc}`
);
process.exit(1);
