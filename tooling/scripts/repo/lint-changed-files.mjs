#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const mode = args.has("--staged") ? "staged" : args.has("--all") ? "all" : "changed";
const fix = args.has("--fix");
const restage = args.has("--restage");
const toolArg = process.argv.find((arg) => arg.startsWith("--tool="));
const explicitFilesArgIndex = process.argv.findIndex((arg) => arg === "--files");
const explicitFilesInline = process.argv.find((arg) => arg.startsWith("--files="));
const lintableExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".cjs", ".mjs"]);
const tool = toolArg ? toolArg.slice("--tool=".length) : "eslint";

if (tool !== "eslint" && tool !== "oxlint") {
  console.error(`[lint-changed] Unsupported tool "${tool}". Expected "eslint" or "oxlint".`);
  process.exit(1);
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

function runGit(gitArgs) {
  const result = spawnSync("git", gitArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  if (result.error || result.status !== 0) {
    const message = (result.stderr || "").trim() || result.error?.message || "Unknown error";
    throw new Error(`git ${gitArgs.join(" ")} failed: ${message}`);
  }

  return (result.stdout || "").trim();
}

function toLines(text) {
  if (!text) {return [];}
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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
  console.error(`[lint-changed] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const filesToLint = candidateFiles.filter((filePath) => {
  return lintableExtensions.has(path.extname(filePath).toLowerCase()) && existsSync(filePath);
});

if (filesToLint.length === 0) {
  console.log(`[lint-changed] No lintable ${mode} files.`);
  process.exit(0);
}

const toolLabel = tool === "oxlint" ? "Oxlint" : "ESLint";
const linterArgs = tool === "oxlint"
  ? [
      "oxlint",
      "-c",
      ".oxlintrc.json",
      ...(fix ? ["--fix"] : []),
      ...filesToLint,
    ]
  : [
      "eslint",
      ...(fix ? ["--fix"] : []),
      "--no-warn-ignored",
      "--max-warnings=0",
      ...filesToLint,
    ];

console.log(`[lint-changed] Running ${toolLabel} on ${filesToLint.length} file(s).`);

const result = spawnSync("npx", linterArgs, {
  stdio: "inherit",
  shell: true,
});

if (result.error) {
  console.error(`[lint-changed] Failed to run ${toolLabel}: ${result.error.message}`);
  process.exit(1);
}

if (fix && (mode === "staged" || restage) && result.status === 0) {
  const stageResult = spawnSync("git", ["add", "--", ...filesToLint], {
    stdio: "inherit",
    shell: true,
  });

  if (stageResult.error || stageResult.status !== 0) {
    const message = stageResult.error?.message || `git add failed with status ${stageResult.status ?? "unknown"}`;
    console.error(`[lint-changed] Failed to restage fixed files: ${message}`);
    process.exit(1);
  }
}

process.exit(result.status ?? 1);
