import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, checkRemoteConflict, inspectPR, REQUIRED_CHECKS } from './pr-gate.mjs';

const expected = { repository: 'fixture/repo', task_id: 'TASK-022', pr_number: 7, head: 'task/TASK-022-ci', commit_sha: 'a'.repeat(40) };
const pr = { number: 7, base: { ref: 'main' }, head: { ref: expected.head, sha: expected.commit_sha, repo: { full_name: expected.repository } }, state: 'open', merged: false };
const run = { id: 12, head_sha: expected.commit_sha, event: 'pull_request', jobs: REQUIRED_CHECKS.map(name => ({ name, status: 'completed', conclusion: 'success' })) };
test('only latest current head CI success reaches Human Review; Approve never completes Task', () => {
  assert.equal(evaluate(pr, [run], [{ id: 1, user: { login: 'human' }, state: 'APPROVED' }], expected).status, 'HUMAN_REVIEW_PENDING');
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'neutral', 'skipped', null]) {
    for (const index of REQUIRED_CHECKS.keys()) {
      const jobs = structuredClone(run.jobs); jobs[index].conclusion = conclusion;
      assert.equal(evaluate(pr, [{ ...run, jobs }], [], expected).status, 'BLOCKED');
    }
  }
  for (const runs of [[], [{ ...run, head_sha: 'b'.repeat(40) }], [run, { ...run, id: 13, jobs: [] }]]) assert.equal(evaluate(pr, runs, [], expected).status, 'CI_PENDING');
  assert.throws(() => evaluate({ ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } }, [run], [], expected));
});
test('Changes Requested preserves review commit and only observed single-parent Merge records dependency', () => {
  const review = { id: 3, user: { login: 'human' }, state: 'CHANGES_REQUESTED', commit_id: expected.commit_sha };
  const result = evaluate(pr, [run], [review], expected);
  assert.equal(result.status, 'REWORK_REQUIRED'); assert.equal(result.reviews[0].commit_id, expected.commit_sha);
  assert.equal(evaluate(pr, [], [review], expected).status, 'REWORK_REQUIRED');
  const merged = { ...pr, merged: true, state: 'closed', merged_by: { login: 'human' }, merge_commit_sha: 'c'.repeat(40), merged_at: '2026-10-02' };
  assert.throws(() => evaluate(merged, [run], [], expected, { sha: merged.merge_commit_sha, parents: [{}, {}] }));
  const merge = { sha: merged.merge_commit_sha, parents: [{}] };
  const observed = evaluate(merged, [run], [], expected, merge);
  assert.equal(observed.status, 'MERGED');
  assert.deepEqual(observed.dependency_evidence, { task_id: expected.task_id, pr_number: pr.number, head_sha: expected.commit_sha, merge_sha: merge.sha, merged_at: merged.merged_at, merged_by: 'human' });
  assert.equal(evaluate(merged, [run], [review], expected, merge).status, 'REWORK_REQUIRED');
  assert.equal(evaluate(merged, [run], [review, { ...review, id: 4, state: 'DISMISSED' }], expected, merge).status, 'MERGED');
  assert.equal(evaluate({ ...pr, state: 'closed' }, [run], [], expected).status, 'BLOCKED');
});
test('all pages block duplicates including another head and remote SHA collision', async () => {
  for (const duplicate of [{ head: { ref: expected.head }, title: '', body: '' }, { head: { ref: 'other' }, title: 'TASK-022 work', body: '' }]) {
    await assert.rejects(checkRemoteConflict(async () => JSON.stringify([[], [duplicate]]), { ...expected, revision: expected.commit_sha }));
  }
  await assert.rejects(checkRemoteConflict(async args => args.at(-1).includes('/pulls?') ? '[[]]' : JSON.stringify([[{ ref: `refs/heads/${expected.head}`, object: { sha: 'b'.repeat(40) } }]]), { ...expected, revision: expected.commit_sha }));
});
test('inspection audits failed CI and comments once without Merge or retry', async () => {
  const calls = [], records = [];
  const invoke = async args => {
    calls.push(args); let stdout = '';
    const endpoint = args.at(-1);
    if (args[1] === 'api') {
      if (endpoint.endsWith('/pulls/7')) stdout = JSON.stringify(pr);
      else if (endpoint.includes('/reviews?')) stdout = '[[]]';
      else if (endpoint.includes('/jobs?')) stdout = JSON.stringify([{ jobs: run.jobs.map(x => ({ ...x, conclusion: 'failure' })) }]);
      else stdout = JSON.stringify([{ workflow_runs: [run] }]);
    }
    return { code: 0, stdout, stderr: '' };
  };
  const result = await inspectPR({ root: '.', expected, record: async (...args) => records.push(args), invoke });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(calls.filter(x => x.includes('comment')).length, 1);
  assert.ok(!calls.some(x => x.includes('merge') || x.includes('approve')));
  assert.ok(records.some(x => x[0] === 'pr-observation.json'));
});

for (const failure of [{ code: 1, stderr: 'Comment rejected' }, { code: null, failure: 'timeout' }]) {
  test(`failed CI Comment (${failure.failure ?? 'exit 1'}) preserves observation without retry`, async () => {
    const calls = [], records = [];
    const invoke = async args => {
      calls.push(args);
      if (args[1] === 'pr' && args[2] === 'comment') return { stdout: '', stderr: '', ...failure };
      const endpoint = args.at(-1);
      let stdout = '';
      if (args[1] === 'api') {
        if (endpoint.endsWith('/pulls/7')) stdout = JSON.stringify(pr);
        else if (endpoint.includes('/reviews?')) stdout = '[[]]';
        else if (endpoint.includes('/jobs?')) stdout = JSON.stringify([{ jobs: run.jobs.map(x => ({ ...x, conclusion: 'failure' })) }]);
        else stdout = JSON.stringify([{ workflow_runs: [run] }]);
      }
      return { code: 0, stdout, stderr: '' };
    };
    const result = await inspectPR({ root: '.', expected, record: async (...args) => records.push(args), invoke });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.reason, 'Current head CI failed, cancelled, timed out or non-success');
    assert.equal(calls.filter(x => x.includes('comment')).length, 1);
    assert.deepEqual(records.filter(([name]) => name === 'pr-observation.json'), [['pr-observation.json', { expected, ...result }]]);
    const commentFailures = records.filter(([name]) => name === 'pr-comment-failure.json');
    assert.equal(commentFailures.length, 1);
    assert.equal(commentFailures[0][1].status, 'BLOCKED');
    assert.match(commentFailures[0][1].reason, failure.failure ? /Timeout/ : /PR query failed/);
  });
}

test('closed PR with successful CI stops with accurate audit and no failure Comment', async () => {
  const calls = [], records = [];
  const invoke = async args => {
    calls.push(args); let stdout = '';
    const endpoint = args.at(-1);
    if (args[1] === 'api') {
      if (endpoint.endsWith('/pulls/7')) stdout = JSON.stringify({ ...pr, state: 'closed' });
      else if (endpoint.includes('/reviews?')) stdout = '[[]]';
      else if (endpoint.includes('/jobs?')) stdout = JSON.stringify([{ jobs: run.jobs }]);
      else stdout = JSON.stringify([{ workflow_runs: [run] }]);
    }
    return { code: 0, stdout, stderr: '' };
  };
  const result = await inspectPR({ root: '.', expected, record: async (...args) => records.push(args), invoke });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'PR closed without Merge');
  assert.equal(calls.filter(x => x.includes('comment')).length, 0);
  assert.ok(records.some(([name, value]) => name === 'pr-observation.json' && value.reason === 'PR closed without Merge'));
  assert.ok(!calls.some(x => x.includes('merge') || x.includes('approve')));
});

test('Timeout stops without query retry and leaves audit and one fixed Comment', async () => {
  const calls = [], records = [];
  const invoke = async args => {
    calls.push(args);
    if (args.at(-1).endsWith('/pulls/7')) return { code: 0, stdout: JSON.stringify(pr), stderr: '' };
    if (args.at(-1).includes('/runs?')) return { code: null, failure: 'timeout', stdout: '', stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  };
  await assert.rejects(inspectPR({ root: '.', expected, record: async (...args) => records.push(args), invoke }), /Timeout/);
  assert.equal(calls.filter(x => x.at(-1).includes('/runs?')).length, 1);
  assert.equal(calls.filter(x => x.includes('comment')).length, 1);
  assert.ok(records.some(x => x[0] === 'pr-observation.json'));
});
