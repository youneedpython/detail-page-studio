import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocked, Stop, processRun, redact, sanitize } from './lib.mjs';
import { acquireLock } from './workspace.mjs';

// Job names in .github/workflows/ci.yml that must succeed on the current PR head.
export const REQUIRED_CHECKS = ['verify'];

export function identity(pr, expected) {
  if (pr.number !== expected.pr_number || pr.base.ref !== 'main' || pr.head.ref !== expected.head || pr.head.sha !== expected.commit_sha || pr.head.repo?.full_name !== expected.repository) blocked('PR identity / head SHA conflict');
}

export function evaluate(pr, runs, reviews, expected, merge) {
  identity(pr, expected);
  // Review decisions are evidence only, never Task approval.
  const latest = new Map();
  for (const review of [...reviews].sort((a, b) => a.id - b.id)) {
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) latest.set(review.user.login, review);
  }
  const changes = [...latest.values()].filter(x => x.state === 'CHANGES_REQUESTED');
  if (changes.length) return { status: 'REWORK_REQUIRED', reason: 'Human Changes Requested', reviews: changes.map(x => ({ id: x.id, commit_id: x.commit_id, submitted_at: x.submitted_at, state: x.state })), head_sha: pr.head.sha };
  const current = runs.filter(x => x.head_sha === expected.commit_sha && x.event === 'pull_request');
  const run = current.sort((a, b) => b.id - a.id)[0];
  if (!run) return { status: 'CI_PENDING', reason: 'Current head CI missing' };
  const jobs = run.jobs ?? [];
  const checks = REQUIRED_CHECKS.map(name => jobs.filter(x => x.name === name));
  if (checks.some(x => x.length !== 1 || x[0].status !== 'completed' || x[0].conclusion !== 'success')) {
    const failed = checks.flat().some(x => x.status === 'completed' && x.conclusion !== 'success');
    return { status: failed ? 'BLOCKED' : 'CI_PENDING', reason: failed ? 'Current head CI failed, cancelled, timed out or non-success' : 'Current head checks missing or pending', run_id: run.id };
  }
  if (pr.merged) {
    if (!pr.merged_by || !pr.merge_commit_sha || !merge || merge.parents?.length !== 1 || merge.sha !== pr.merge_commit_sha) blocked('Squash Merge evidence missing');
    return { status: 'MERGED', dependency_evidence: { task_id: expected.task_id, pr_number: pr.number, head_sha: pr.head.sha, merge_sha: merge.sha, merged_at: pr.merged_at, merged_by: pr.merged_by.login }, reason: 'Human Squash Merge observed; no next Task execution or promotion' };
  }
  if (pr.state !== 'open') return { status: 'BLOCKED', reason: 'PR closed without Merge' };
  return { status: 'HUMAN_REVIEW_PENDING', reason: 'Current head CI success; Human Squash Merge required', head_sha: pr.head.sha, run_id: run.id };
}

export function githubClient({ root, record, signal, invoke = processRun }) {
  let sequence = 0;
  return async (args, auth = false) => {
    const result = await invoke(['gh', ...args], { cwd: root, timeout: 30000, signal, env: { ...process.env, GH_PROMPT_DISABLED: '1' } });
    await record(`pr-command-${++sequence}.json`, { command: ['gh', ...args], code: result.code, failure: result.failure ?? null });
    if (result.failure) blocked('PR query process failure / Timeout; no automatic retry');
    if (result.code !== 0) {
      if (auth || /authentication|not logged|HTTP 401|HTTP 403/i.test(result.stderr ?? '')) throw new Stop('HUMAN_REQUIRED', 'GitHub authentication unavailable; Human login required');
      blocked('PR query failed; no automatic retry');
    }
    return result.stdout;
  };
}

export async function pages(call, endpoint, key) {
  const data = JSON.parse(await call(['api', '--paginate', '--slurp', endpoint]));
  if (!Array.isArray(data) || data.some(page => !Array.isArray(key ? page[key] : page))) blocked('Malformed paginated GitHub response');
  return data.flatMap(page => key ? page[key] : page);
}

export async function checkRemoteConflict(call, { repository, head, task_id, revision }) {
  const prs = await pages(call, `repos/${repository}/pulls?state=open&per_page=100`);
  if (prs.some(pr => pr.head.ref === head || new RegExp(`\\b${task_id}\\b`).test(`${pr.head.ref}\n${pr.title}\n${pr.body ?? ''}`))) blocked('Duplicate / concurrent Task PR');
  const refs = await pages(call, `repos/${repository}/git/matching-refs/heads/${head}?per_page=100`);
  const ref = refs.find(x => x.ref === `refs/heads/${head}`);
  if (ref && ref.object.sha !== revision) blocked('Remote Task branch SHA conflict');
}

export async function inspectPR({ root, expected, record, signal, invoke }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expected.repository) || !Number.isSafeInteger(expected.pr_number) || expected.pr_number < 1 || !/^TASK-\d{3}$/.test(expected.task_id) || !new RegExp(`^task/${expected.task_id}-[a-z0-9-]+$`).test(expected.head) || !/^[a-f0-9]{40}$/.test(expected.commit_sha)) blocked('Invalid stored PR identity');
  const call = githubClient({ root, record, signal, invoke });
  await call(['auth', 'status'], true);
  const prefix = `repos/${expected.repository}`;
  const readPR = async () => JSON.parse(await call(['api', `${prefix}/pulls/${expected.pr_number}`]));
  let result, verified = false;
  try {
    const pr = await readPR();
    identity(pr, expected);
    verified = true;
    const runs = await pages(call, `${prefix}/actions/workflows/ci.yml/runs?head_sha=${expected.commit_sha}&event=pull_request&per_page=100`, 'workflow_runs');
    const newest = runs.filter(x => x.head_sha === expected.commit_sha && x.event === 'pull_request').sort((a, b) => b.id - a.id)[0];
    if (newest) newest.jobs = await pages(call, `${prefix}/actions/runs/${newest.id}/jobs?filter=latest&per_page=100`, 'jobs');
    const reviews = await pages(call, `${prefix}/pulls/${expected.pr_number}/reviews?per_page=100`);
    const final = await readPR();
    identity(final, expected);
    const merge = final.merged ? JSON.parse(await call(['api', `${prefix}/commits/${final.merge_commit_sha}`])) : null;
    result = evaluate(final, runs, reviews, expected, merge);
    await record('pr-observation.json', { expected, ...result });
    if (result.status === 'BLOCKED' && result.reason !== 'PR closed without Merge') {
      try { await call(['pr', 'comment', String(expected.pr_number), '--repo', expected.repository, '--body', `Harness ${expected.task_id}: current head ${expected.commit_sha} CI did not pass. Harness stopped; inspect CI and local audit. No Merge or automatic retry.`]); }
      catch (commentError) { await record('pr-comment-failure.json', { status: commentError.status, reason: commentError.message }); }
    }
    return result;
  } catch (error) {
    await record('pr-observation.json', { expected, status: error.status ?? 'BLOCKED', reason: error.message });
    if (verified && !/identity|head SHA|authentication/.test(error.message)) {
      try { await call(['pr', 'comment', String(expected.pr_number), '--repo', expected.repository, '--body', `Harness ${expected.task_id}: PR observation failed or timed out for stored head ${expected.commit_sha}. Harness stopped; inspect local audit. No Merge or automatic retry.`]); }
      catch (commentError) { await record('pr-comment-failure.json', { status: commentError.status, reason: commentError.message }); }
    }
    throw error;
  }
}

// One explicit observation per invocation. No polling, retry, Merge or execution.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let release;
  try {
    const runId = process.argv[2];
    if (process.argv.length !== 3 || !/^[A-Za-z0-9-]+$/.test(runId ?? '')) blocked('Usage: node scripts/orchestrator/pr-gate.mjs <run-id>');
    const root = process.cwd();
    release = await acquireLock(root, `pr-${runId}`);
    const dir = path.join(root, '.harness/runs', runId);
    const expected = JSON.parse(await readFile(path.join(dir, 'git-result.json'), 'utf8'));
    const record = async (name, value) => writeFile(path.join(dir, name), JSON.stringify(sanitize(value), null, 2) + '\n', 'utf8');
    const result = await inspectPR({ root, expected, record });
    process.stdout.write(redact(JSON.stringify(result)) + '\n');
    process.exitCode = ['BLOCKED', 'REWORK_REQUIRED'].includes(result.status) ? 3 : 0;
  } catch (error) { process.stderr.write(redact(error.message) + '\n'); process.exitCode = error.status === 'HUMAN_REQUIRED' ? 2 : 3; }
  finally { if (release) await release(); }
}
