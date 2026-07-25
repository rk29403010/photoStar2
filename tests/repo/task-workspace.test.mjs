import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildTaskStartPlan } from '../../tooling/scripts/repo/task-workspace.js';

const gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';
const script = path.resolve('tooling/scripts/repo/task-workspace.js');

function git(args, cwd) {return execFileSync(gitExecutable, args, { cwd, encoding: 'utf8' });}

function createFixture() {
    const root = mkdtempSync(path.join(os.tmpdir(), 'photostar-task-workspace-'));
    const remote = path.join(root, 'remote.git');
    const clone = path.join(root, 'clone');
    git(['init', '--bare', '--initial-branch=main', remote], root);
    git(['clone', remote, clone], root);
    git(['config', 'user.email', 'fixture@example.test'], clone);
    git(['config', 'user.name', 'Fixture'], clone);
    mkdirSync(path.join(clone, '.worktrees'));
    writeFileSync(path.join(clone, '.gitignore'), '.worktrees\n');
    writeFileSync(path.join(clone, 'README.md'), 'fixture\n');
    git(['add', '.'], clone); git(['commit', '-m', 'fixture'], clone); git(['push', '-u', 'origin', 'main'], clone);
    return { root, clone };
}

function run(args, cwd) {
    return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
}

function registry(cwd) {
    const registryPath = path.join(cwd, '.git', 'codex-thread-state.json');
    return existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, 'utf8')) : { entries: [] };
}

function normalizedPath(targetPath) {return path.resolve(targetPath).replaceAll('\\', '/').toLowerCase();}

function start(task, cwd, extra = []) {
    const result = run(['start', '--task', task, '--workspace', 'worktree', '--json', ...extra], cwd);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test('task:start creates a registered isolated worktree with structured editor-neutral identity', () => {
    const fixture = createFixture();
    try {
        const output = start('Isolated task', fixture.clone);
        assert.equal(output.branch, 'task/isolated-task');
        assert.equal(output.taskId, 'task-isolated-task');
        assert.equal(output.workspaceMode, 'worktree');
        assert.match(output.workspacePath, /[\\/]\.worktrees[\\/]isolated-task$/);
        assert.equal(registry(fixture.clone).entries.length, 1);
    } finally {rmSync(fixture.root, { recursive: true, force: true });}
});

test('task:start resumes an existing registered worktree without changing identity', () => {
    const fixture = createFixture();
    try {
        const created = start('Resume task', fixture.clone);
        const resumed = start('Resume task', fixture.clone);
        assert.deepEqual(resumed, created);
        assert.equal(registry(fixture.clone).entries.length, 1);
    } finally {rmSync(fixture.root, { recursive: true, force: true });}
});

test('task:start supports an explicit worktree path outside the repository default directory', () => {
    const fixture = createFixture();
    try {
        const externalPath = path.join(fixture.root, 'editor-owned-worktree');
        const output = start('External path task', fixture.clone, ['--path', externalPath]);
        assert.equal(normalizedPath(output.workspacePath), normalizedPath(externalPath));
        assert.equal(git(['branch', '--show-current'], externalPath).trim(), output.branch);
    } finally {rmSync(fixture.root, { recursive: true, force: true });}
});

test('task:register records an editor-created worktree with its actual path', () => {
    const fixture = createFixture();
    try {
        const editorWorktree = path.join(fixture.root, 'opened-by-editor');
        git(['worktree', 'add', '-b', 'task/editor-created', editorWorktree, 'main'], fixture.clone);
        const duplicateStart = run(['start', '--task', 'Editor created', '--workspace', 'worktree'], fixture.clone);
        assert.notEqual(duplicateStart.status, 0); assert.match(duplicateStart.stderr, /Register that worktree/i);
        const result = run(['register', '--task', 'Editor created', '--workspace', 'worktree', '--json'], editorWorktree);
        assert.equal(result.status, 0, result.stderr);
        const output = JSON.parse(result.stdout);
        assert.equal(normalizedPath(output.workspacePath), normalizedPath(editorWorktree));
        assert.equal(output.branch, 'task/editor-created');
        assert.equal(output.taskId, 'task-editor-created');
    } finally {rmSync(fixture.root, { recursive: true, force: true });}
});

test('task:start refuses a dirty primary workspace before refreshing or creating', () => {
    const fixture = createFixture();
    try {
        writeFileSync(path.join(fixture.clone, 'dirty.txt'), 'dirty\n');
        const result = run(['start', '--task', 'Dirty task', '--workspace', 'worktree'], fixture.clone);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /uncommitted changes/i);
        assert.equal(registry(fixture.clone).entries.length, 0);
    } finally {rmSync(fixture.root, { recursive: true, force: true });}
});

test('task tooling prevents duplicate active task bindings and two tasks in one workspace', () => {
    const fixture = createFixture();
    try {
        const bound = start('Bound task', fixture.clone);
        const secondPath = path.join(fixture.root, 'second-worktree');
        git(['worktree', 'add', '-b', 'task/second', secondPath, 'main'], fixture.clone);
        const duplicateTask = run(['register', '--task', 'Bound task', '--workspace', 'worktree'], secondPath);
        assert.notEqual(duplicateTask.status, 0); assert.match(duplicateTask.stderr, /already bound/i);
        const duplicateWorkspace = run(['register', '--task', 'Another task', '--workspace', 'worktree'], bound.workspacePath);
        assert.notEqual(duplicateWorkspace.status, 0); assert.match(duplicateWorkspace.stderr, /already bound/i);
    } finally {rmSync(fixture.root, { recursive: true, force: true });}
});

test('task start plan uses a neutral branch, stable task record id, and worktree mode', () => {
    assert.deepEqual(buildTaskStartPlan({ task: 'Editor neutral' }), {
        task: 'Editor neutral', taskId: 'task-editor-neutral', branch: 'task/editor-neutral', workspace: 'worktree', workspacePath: '',
    });
});
