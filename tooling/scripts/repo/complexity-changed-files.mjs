#!/usr/bin/env node

import { buildReport } from "./complexity-report.js";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const mode = args.has("--staged") ? "staged" : args.has("--all") ? "all" : "changed";
const explicitFilesArgIndex = process.argv.findIndex((arg) => arg === "--files");
const explicitFilesInline = process.argv.find((arg) => arg.startsWith("--files="));
const typescriptExtensions = new Set([".ts", ".tsx"]);
const thresholds = {
  maxCyclomatic: Number.parseInt(process.env.COMPLEXITY_MAX_CYCLOMATIC || "10", 10),
  maxCognitive: Number.parseInt(process.env.COMPLEXITY_MAX_COGNITIVE || "20", 10),
  maxLoc: Number.parseInt(process.env.COMPLEXITY_MAX_LOC || "90", 10),
};

function runGit(gitArgs) {
  const result = spawnSync("git", gitArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error || result.status !== 0) {
    const message = (result.stderr || "").trim() || result.error?.message || "Unknown error";
    throw new Error(`git ${gitArgs.join(" ")} failed: ${message}`);
  }

  return (result.stdout || "").trim();
}

function toLines(text) {
  if (!text) {
    return [];
  }

  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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

  if (mode === "all") {
    return toLines(runGit(["ls-files"]));
  }

  if (mode === "staged") {
    return toLines(runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMRT"]));
  }

  const explicitBase = process.env.LINT_DIFF_BASE;
  if (explicitBase) {
    return toLines(runGit(["diff", "--name-only", "--diff-filter=ACMRT", `${explicitBase}...HEAD`]));
  }

  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
    return toLines(runGit(["diff", "--name-only", "--diff-filter=ACMRT", `origin/${githubBaseRef}...HEAD`]));
  }

  return toLines(runGit(["diff", "--name-only", "--diff-filter=ACMRT", "HEAD"]));
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
