import { mkdir, open, readFile, rm, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { blocked, git, changes, readJson, snapshot } from './lib.mjs';

export async function repositoryIdentity(root) {
  return realpath((await git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim());
}

// Common git-dir identity shares one lock across every worktree and Task.
// Exclusive creation deliberately does not reclaim stale locks automatically.
export async function acquireLock(root, runId) {
  const identity = await repositoryIdentity(root);
  const key = createHash('sha256').update(process.platform === 'win32' ? identity.toLowerCase() : identity).digest('hex');
  const directory = path.join(os.tmpdir(), 'harness-orchestrator-locks');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, key + '.json');
  let handle;
  try { handle = await open(file, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') blocked('Repository execution lock held; Human must inspect stale owner before removal'); throw error; }
  await handle.writeFile(JSON.stringify({ run_id: runId, pid: process.pid }));
  await handle.close();
  return async () => {
    const owner = JSON.parse(await readFile(file, 'utf8'));
    if (owner.run_id !== runId) blocked('Lock ownership changed');
    await rm(file);
  };
}

export async function createWorkspace(root, runId, revision) {
  const target = path.join(root, '.harness/workspaces', workspaceName(runId));
  await mkdir(path.dirname(target), { recursive: true });
  await git(root, ['worktree', 'add', '--detach', target, revision]);
  if ((await changes(target)).length) blocked('New worktree is dirty');
  return target;
}

export function workspaceName(runId) {
  return createHash('sha256').update(runId).digest('hex').slice(0, 16);
}

// Preserve changed worktrees as review artifacts; never force-remove user work.
export async function cleanupWorkspace(root, target) {
  const parent = await realpath(path.join(root, '.harness/workspaces'));
  const resolved = await realpath(target);
  const relative = path.relative(parent, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) blocked('Unsafe workspace cleanup');
  if ((await changes(target)).length) blocked('Workspace has changes; retain for Human review');
  await git(root, ['worktree', 'remove', target]);
}

// Explicit cleanup of the reviewed worktree after a recorded PR handoff.
export async function cleanupSuccessfulRun(root, runId) {
  if (!/^[A-Za-z0-9-]+$/.test(runId)) blocked('Invalid run id');
  const release = await acquireLock(root, runId + '-cleanup');
  try {
    const directory = path.join(root, '.harness/runs', runId);
    const state = await readJson(path.join(directory, 'state.json'));
    const frozen = await readJson(path.join(directory, 'frozen.json'));
    const result = await readJson(path.join(directory, 'git-result.json'));
    if (state.status !== 'HANDOFF_PENDING' || state.run_id !== runId || !state.git?.pr_url || state.git.pr_url !== result.pr_url || state.git.commit_sha !== result.commit_sha) blocked('Only completed PR handoffs may be cleaned');
    if (!frozen.workspace_created || frozen.repository !== await repositoryIdentity(root)) blocked('Cleanup repository mismatch');
    const parent = await realpath(path.join(root, '.harness/workspaces'));
    const target = await realpath(frozen.workspace);
    const relative = path.relative(parent, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)) blocked('Unsafe workspace cleanup');
    if (await repositoryIdentity(target) !== frozen.repository || (await git(target, ['rev-parse', 'HEAD'])).trim() !== frozen.revision) blocked('Cleanup worktree identity mismatch');
    const hash = createHash('sha256').update(JSON.stringify(await snapshot(target))).digest('hex');
    if (hash !== state.snapshot_hash) blocked('Workspace changed since handoff');
    // Node uses Windows extended paths, avoiding Git's long node_modules paths.
    await rm(process.platform === 'win32' ? path.toNamespacedPath(target) : target, { recursive: true });
    await git(root, ['worktree', 'remove', target]);
  } finally { await release(); }
}
