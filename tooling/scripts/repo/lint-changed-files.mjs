#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { runCommandSync } from "./process-invocation.js";
import { selectQualityFiles } from "./quality-file-selection.js";
import { isTypeAwareApplicationFile } from "./quality-policy.js";

const args = new Set(process.argv.slice(2));
function resolveMode() {
  if (args.has("--staged")) {
    return "staged";
  }
  return args.has("--all") ? "all" : "changed";
}

const mode = resolveMode();
const fix = args.has("--fix");
const restage = args.has("--restage");
const typeAware = args.has("--type-aware");
const applicationOnly = args.has("--application-only");
const toolArg = process.argv.find((arg) => arg.startsWith("--tool="));
const explicitFilesArgIndex = process.argv.findIndex((arg) => arg === "--files");
const explicitFilesInline = process.argv.find((arg) => arg.startsWith("--files="));
const lintableExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".cjs", ".mjs"]);
const tool = toolArg ? toolArg.slice("--tool=".length) : "eslint";

function getLocalLinterExecutable() {
  const executable = process.platform === "win32" ? `${tool}.cmd` : tool;
  return path.join(process.cwd(), "node_modules", ".bin", executable);
}

if (tool !== "eslint" && tool !== "oxlint") {
  console.error(`[lint-changed] Unsupported tool "${tool}". Expected "eslint" or "oxlint".`);
  process.exit(1);
}
if ((typeAware || applicationOnly) && tool !== "oxlint") {
  console.error("[lint-changed] --type-aware and --application-only require --tool=oxlint.");
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
  const result = runCommandSync({
    command: "git",
    args: gitArgs,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error || result.status !== 0) {
    const message = (result.stderr || "").trim() || result.error?.message || "Unknown error";
    throw new Error(`git ${gitArgs.join(" ")} failed: ${message}`);
  }

  return result.stdout || "";
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
  console.error(`[lint-changed] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const filesToLint = candidateFiles.filter((filePath) => {
  const isLintable = lintableExtensions.has(path.extname(filePath).toLowerCase()) && existsSync(filePath);
  return isLintable && (!applicationOnly || isTypeAwareApplicationFile(filePath));
});

if (filesToLint.length === 0) {
  console.log(`[lint-changed] No lintable ${mode} files.`);
  process.exit(0);
}

function resolveToolLabel() {
  if (typeAware) {
    return "type-aware Oxlint";
  }
  return tool === "oxlint" ? "Oxlint" : "ESLint";
}

const toolLabel = resolveToolLabel();
const oxlintConfigPath = typeAware ? ".oxlintrc.json" : ".oxlintrc.fast-loop.json";
let linterArgs;
if (tool === "oxlint") {
  linterArgs = [
      "oxlint",
      "-c",
      oxlintConfigPath,
      ...(typeAware ? ["--type-aware"] : []),
      ...(fix ? ["--fix"] : []),
      ...filesToLint,
    ];
} else {
  linterArgs = [
      "eslint",
      ...(fix ? ["--fix"] : []),
      "--no-warn-ignored",
      "--max-warnings=0",
      ...filesToLint,
    ];
}

let phaseLabel = "verify";
if (fix) {
  phaseLabel = restage || mode === "staged" ? "autofix + restage" : "autofix";
}
console.log(`[lint-changed] Running ${toolLabel} ${phaseLabel} on ${filesToLint.length} file(s).`);

const result = runCommandSync({
  command: getLocalLinterExecutable(),
  args: linterArgs.slice(1),
  stdio: "inherit",
});

if (result.error) {
  console.error(`[lint-changed] Failed to run ${toolLabel}: ${result.error.message}`);
  process.exit(1);
}

if (fix && (mode === "staged" || restage) && result.status === 0) {
  const stageResult = runCommandSync({
    command: "git",
    args: ["add", "--", ...filesToLint],
    stdio: "inherit",
  });

  if (stageResult.error || stageResult.status !== 0) {
    const message = stageResult.error?.message || `git add failed with status ${stageResult.status ?? "unknown"}`;
    console.error(`[lint-changed] Failed to restage fixed files: ${message}`);
    process.exit(1);
  }
}

process.exit(result.status ?? 1);
