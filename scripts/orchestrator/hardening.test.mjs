import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { decide } from './state-machine.mjs';
import { syncAgents, guardAgents } from './status-sync.mjs';
import { classify, guard, processRun } from './lib.mjs';
import { acquireLock, createWorkspace, cleanupWorkspace, cleanupSuccessfulRun, repositoryIdentity } from './workspace.mjs';
import { run } from './run.mjs';

const fake = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url));
const executor = { status: 'HUMAN_REQUIRED', human_decisions_needed: ['Decision'], handoff_actions: [] };
const review = verdict => ({ verdict, findings: verdict === 'PASS' ? [] : [{ id: 'F1', message: 'fix this', path: 'output.txt' }] });

test('Human requests require rework for CHANGES_REQUIRED; BLOCKED takes precedence', () => {
  for (const verdict of ['PASS', 'HUMAN_REQUIRED']) assert.equal(decide(executor, review(verdict), 1).status, 'HUMAN_REQUIRED');
  assert.equal(decide(executor, review('CHANGES_REQUIRED'), 1).status, 'REWORK');
  assert.equal(decide(executor, review('BLOCKED'), 1).status, 'BLOCKED');
  assert.equal(decide({ ...executor, human_decisions_needed: [], handoff_actions: ['Prepare PR'] }, review('PASS'), 1).status, 'HANDOFF_PENDING');
  assert.equal(decide({ ...executor, status: 'DONE', human_decisions_needed: [] }, review('CHANGES_REQUIRED'), 3).status, 'HUMAN_REQUIRED');
});

test('AGENTS synchronization only permits the two section 3 fields', () => {
  const before = '# Rules\n## 3. Current phase\nUnchanged\nCurrent Task:\n```text\nTASK-019 old\n```\nStatus:\n```text\nREADY\n```\nOther rules\n## 4. Rules\nPreserve\n';
  const tasks = '## 3. Current Task\nTASK-021 next\nStatus:\n```text\nBLOCKED\n```\n## 4. List\n';
  const after = syncAgents(before, tasks);
  assert.equal(after, before.replace('TASK-019 old', 'TASK-021 next').replace('READY', 'BLOCKED'));
  guardAgents(before, after, tasks);
  assert.throws(() => guardAgents(before, after.replace('Preserve', 'Changed'), tasks), /exceeds/);
  assert.throws(() => syncAgents(before, tasks.replace('BLOCKED', 'UNKNOWN')), /Invalid/);
});

test('failure categories and secret guard do not expose content', () => {
  for (const [message, category] of [['login unconfirmed', 'auth'], ['usage limit', 'quota'], ['timeout', 'timeout'], ['spawn EPERM', 'sandbox'], ['Malformed JSON', 'schema']]) assert.equal(classify(message), category);
  const contract = { allowed_paths: ['output.txt', '.env.local'], forbidden_paths: [] };
  assert.throws(() => guard({ entries: [{ file: '.env.local' }], diff: '' }, ['.env.local'], contract), /Secret file/);
  const synthetic = ['sk', 'synthetic0123456789'].join('-');
  assert.throws(() => guard({ entries: [{ file: 'output.txt' }], diff: '+' + synthetic }, ['output.txt'], contract), error => !error.message.includes(synthetic) && /Secret-like/.test(error.message));
});

test('AGENTS preserves CRLF and guards only code-block values with real headings', () => {
  const before = '# Rules\r\n## 3. 현재 단계 규칙\r\nCurrent Task:\r\n\r\n```text\r\nTASK-020 old\r\n```\r\nStatus:\r\n\r\n```text\r\nIN_PROGRESS\r\n```\r\nKeep IN_PROGRESS prose\r\n## 3.1 문서 충돌\r\nPreserve\r\n';
  const tasks = '## 3. Current Task\r\n\r\nTASK-021 next\r\n\r\nStatus:\r\n\r\n```text\r\nBLOCKED\r\n```\r\n## 4. 전체 Task 목록\r\n';
  const after = syncAgents(before, tasks);
  assert.equal(after, before.replace('TASK-020 old', 'TASK-021 next').replace('IN_PROGRESS', 'BLOCKED'));
  assert.equal(after.replaceAll('\r\n', '').includes('\n'), false);
  guardAgents(before, after, tasks);
  guardAgents(before, after.replaceAll('\r\n', '\n'), tasks);
  for (const changed of [after.replace('Keep IN_PROGRESS', 'Keep BLOCKED'), after.replace('## 3.1', '## 3.2'), after.replace('TASK-021 next', 'TASK-022 wrong')]) {
    assert.throws(() => guardAgents(before, changed, tasks), /exceeds/);
  }
});

test('Executor edits CRLF AGENTS completion values; Orchestrator validates end-to-end', async t => {
  const root = await fixture(t, 'agents-sync');
  const agents = '# Rules\r\n## 3. 현재 단계 규칙\r\nCurrent Task:\r\n```text\r\nTASK-020 old\r\n```\r\nStatus:\r\n```text\r\nIN_PROGRESS\r\n```\r\n## 3.1 문서 충돌\r\nPreserve\r\n';
  const tasks = '## 3. Current Task\r\nTASK-021 next\r\nStatus:\r\n```text\r\nBLOCKED\r\n```\r\n## 4. 전체 Task 목록\r\n';
  await mkdir(path.join(root, 'docs'));
  await writeFile(path.join(root, '.gitattributes'), 'AGENTS.md text eol=crlf\ndocs/07-TASKS.md text eol=crlf\n');
  await writeFile(path.join(root, 'AGENTS.md'), agents);
  await writeFile(path.join(root, 'docs/07-TASKS.md'), tasks);
  const contractPath = path.join(root, 'harness/tasks/TASK-019.json');
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  contract.allowed_paths.push('AGENTS.md');
  await writeFile(contractPath, JSON.stringify(contract));
  for (const args of [['add', '.'], ['-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'completion fixture']]) {
    const result = await processRun(['git', ...args], { cwd: root, timeout: 10000 });
    assert.equal(result.code, 0, result.stderr);
  }
  const result = await run('TASK-019', { root });
  assert.equal(result.status, 'PASS', result.state.reason);
  const workspaceAgents = await readFile(path.join(result.state.workspace, 'AGENTS.md'), 'utf8');
  guardAgents(agents, workspaceAgents, tasks);
  assert.match(workspaceAgents, /TASK-021 next\r\n/);
  assert.equal(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), agents);
});

async function fixture(t, scenario = 'executor-human') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-hardening-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async (...args) => {
    const result = await processRun(['git', ...args], { cwd: root, timeout: 10000 });
    assert.equal(result.code, 0, result.stderr);
  };
  await git('init', '-b', 'task/test');
  await mkdir(path.join(root, 'harness/tasks'), { recursive: true });
  await writeFile(path.join(root, '.gitignore'), '.harness/\nharness/config.local.json\n');
  await writeFile(path.join(root, 'task.md'), 'Fake task');
  await writeFile(path.join(root, 'harness/tasks/TASK-019.json'), JSON.stringify({ id: 'TASK-019', title: 'Fake task', task_file: 'task.md', allowed_paths: ['output.txt'], forbidden_paths: [], verify: [{ command: [process.execPath, fake, scenario, 'verify'], cwd: '.' }], max_review_cycles: 3 }));
  await git('add', '.');
  await git('-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
  await writeFile(path.join(root, 'harness/config.local.json'), JSON.stringify({ codex: { command: [process.execPath, fake, scenario, 'executor'] }, claude: { command: [process.execPath, fake, scenario, 'reviewer'] }, sandbox: 'unelevated', timeouts: { preflight_ms: 10000, executor_ms: 10000, reviewer_ms: 10000, verify_ms: 10000 } }));
  return root;
}

test('Lock release failures return BLOCKED and persist the lock error', async t => {
  for (const mode of ['missing', 'changed-owner']) {
    const root = await fixture(t);
    const identity = await repositoryIdentity(root);
    const key = createHash('sha256').update(process.platform === 'win32' ? identity.toLowerCase() : identity).digest('hex');
    const lockFile = path.join(os.tmpdir(), 'harness-orchestrator-locks', key + '.json');
    t.after(() => rm(lockFile, { force: true }));
    const contractPath = path.join(root, 'harness/tasks/TASK-019.json');
    const contract = JSON.parse(await readFile(contractPath, 'utf8'));
    const script = mode === 'missing'
      ? `require('node:fs').unlinkSync(${JSON.stringify(lockFile)})`
      : `require('node:fs').writeFileSync(${JSON.stringify(lockFile)}, JSON.stringify({run_id:'changed-owner'}))`;
    contract.verify = [{ command: [process.execPath, '-e', script], cwd: '.' }];
    await writeFile(contractPath, JSON.stringify(contract));
    const commit = await processRun(['git', '-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-am', 'lock failure fixture'], { cwd: root, timeout: 10000 });
    assert.equal(commit.code, 0, commit.stderr);
    const result = await run('TASK-019', { root });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.code, 3);
    assert.equal(result.state.error_category, 'lock');
    assert.equal(result.state.lock_error.code, mode === 'missing' ? 'ENOENT' : 'BLOCKED');
    const saved = JSON.parse(await readFile(path.join(result.run_dir, 'state.json'), 'utf8'));
    assert.deepEqual(saved, result.state);
    assert.equal(saved.review_cycles, 1);
  }
});

test('worktree cleanup, source isolation, and common repository lock', async t => {
  const root = await fixture(t);
  const release = await acquireLock(root, 'owner');
  const workspace = await createWorkspace(root, 'test-workspace', 'HEAD');
  try {
    await assert.rejects(acquireLock(workspace, 'other'), /lock held/);
    await writeFile(path.join(workspace, 'output.txt'), 'keep');
    await assert.rejects(readFile(path.join(root, 'output.txt')), { code: 'ENOENT' });
    await assert.rejects(cleanupWorkspace(root, workspace), /retain/);
    await rm(path.join(workspace, 'output.txt'));
    await cleanupWorkspace(root, workspace);
    await assert.rejects(readFile(path.join(workspace, 'task.md')), { code: 'ENOENT' });
  } finally { await release(); }
});

test('Gate rework retains pending decisions until approved Resume', async t => {
  const root = await fixture(t, 'gate-rework');
  const stopped = await run('TASK-019', { root });
  assert.equal(stopped.status, 'HUMAN_REQUIRED', stopped.state.reason);
  const denied = await run(undefined, { root, resumeId: stopped.state.run_id });
  assert.equal(denied.status, 'HUMAN_REQUIRED');
  assert.ok(!denied.state.history.some(x => x.phase === 'Git'));
  await writeFile(path.join(stopped.run_dir, 'resume-approval.json'), JSON.stringify({ approved: true, run_id: stopped.state.run_id, snapshot_hash: stopped.state.snapshot_hash, stop_reason: stopped.state.reason, reference: 'Human test approval' }));
  const resumed = await run(undefined, { root, resumeId: stopped.state.run_id });
  assert.equal(resumed.status, 'PASS', resumed.state.reason);
  assert.equal(resumed.state.review_cycles, 3);
});

test('Resume requires approval tied to diff; approved resume skips duplicate Executor', async t => {
  const root = await fixture(t);
  const stopped = await run('TASK-019', { root });
  assert.equal(stopped.status, 'HUMAN_REQUIRED', stopped.state.reason);
  // A frozen absolute path from the old long-name layout remains authoritative.
  const legacy = path.join(root, '.harness/workspaces', stopped.state.run_id);
  const moved = await processRun(['git', 'worktree', 'move', stopped.state.workspace, legacy], { cwd: root, timeout: 10000 });
  assert.equal(moved.code, 0, moved.stderr);
  stopped.state.workspace = legacy;
  const frozenFile = path.join(stopped.run_dir, 'frozen.json');
  const frozen = JSON.parse(await readFile(frozenFile, 'utf8'));
  frozen.workspace = legacy;
  delete frozen.workspace_name;
  await writeFile(frozenFile, JSON.stringify(frozen));
  await writeFile(path.join(stopped.run_dir, 'state.json'), JSON.stringify(stopped.state));
  const before = await readFile(path.join(stopped.state.workspace, 'output.txt'), 'utf8');
  const stoppedRecord = await readFile(path.join(stopped.run_dir, 'state.json'), 'utf8');
  const denied = await run(undefined, { root, resumeId: stopped.state.run_id });
  assert.equal(denied.status, 'HUMAN_REQUIRED');
  assert.equal(await readFile(path.join(stopped.run_dir, 'state.json'), 'utf8'), stoppedRecord);
  await writeFile(path.join(stopped.state.workspace, 'output.txt'), 'unexpected mutation');
  const mismatch = await run(undefined, { root, resumeId: stopped.state.run_id });
  assert.equal(mismatch.status, 'BLOCKED');
  assert.match(mismatch.state.reason, /diff mismatch/);
  assert.equal(await readFile(path.join(stopped.run_dir, 'state.json'), 'utf8'), stoppedRecord);
  await writeFile(path.join(stopped.state.workspace, 'output.txt'), before);
  await writeFile(path.join(stopped.run_dir, 'resume-approval.json'), JSON.stringify({ approved: true, run_id: stopped.state.run_id, snapshot_hash: stopped.state.snapshot_hash, stop_reason: stopped.state.reason, reference: 'Human test approval' }));
  const resumed = await run(undefined, { root, resumeId: stopped.state.run_id });
  assert.equal(resumed.status, 'PASS', resumed.state.reason);
  assert.equal(resumed.state.review_cycles, 2);
  assert.equal(await readFile(path.join(stopped.state.workspace, 'output.txt'), 'utf8'), before);
});

test('successful handoff cleanup handles long paths and retains stopped or changed runs', async t => {
  const root = await fixture(t);
  const stopped = await run('TASK-019', { root });
  const runId = stopped.state.run_id;
  await assert.rejects(cleanupSuccessfulRun(root, runId));
  assert.equal(await readFile(path.join(stopped.state.workspace, 'output.txt'), 'utf8'), 'cycle=1\nnew content\n');
  const result = { pr_url: 'https://example.invalid/pr/1', commit_sha: 'a'.repeat(40) };
  const state = { ...stopped.state, status: 'HANDOFF_PENDING', git: result };
  await writeFile(path.join(stopped.run_dir, 'state.json'), JSON.stringify(state));
  await writeFile(path.join(stopped.run_dir, 'git-result.json'), JSON.stringify(result));
  await writeFile(path.join(stopped.state.workspace, 'output.txt'), 'changed');
  await assert.rejects(cleanupSuccessfulRun(root, runId), /changed since handoff/);
  await writeFile(path.join(stopped.state.workspace, 'output.txt'), 'cycle=1\nnew content\n');
  const long = path.join(stopped.state.workspace, '.harness', ...Array(12).fill('long-directory-name-123456789'));
  await mkdir(process.platform === 'win32' ? path.toNamespacedPath(long) : long, { recursive: true });
  await writeFile(process.platform === 'win32' ? path.toNamespacedPath(path.join(long, 'ignored.txt')) : path.join(long, 'ignored.txt'), 'fixture');
  await cleanupSuccessfulRun(root, runId);
  await assert.rejects(readFile(path.join(stopped.state.workspace, 'task.md')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(root, 'task.md'), 'utf8'), 'Fake task');
});
