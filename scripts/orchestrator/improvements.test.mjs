import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNoSecrets, guard, readJson, validate, redact } from './lib.mjs';
import { decide } from './state-machine.mjs';
import { workspaceName } from './workspace.mjs';
import { prBody, prTitle, PR_BODY_LIMIT } from './pr-description.mjs';

const assignment = (name, value, separator = '=') => name + separator + value;
test('main baseline secret formats remain blocked in text and introduced lines', () => {
  const inputs = [
    ['-'.repeat(5), 'BEGIN ', ['PRIVATE', 'KEY'].join(' '), '-'.repeat(5), '\nfixture\n', '-'.repeat(5), 'END ', ['PRIVATE', 'KEY'].join(' '), '-'.repeat(5)].join(''),
    ['Bear', 'er fixture-value'].join(''),
    ['sk', '-synthetic0123456789'].join(''),
    ['ghp', '_synthetic0123456789'].join(''),
    ['github', '_pat_synthetic0123456789'].join(''),
    ['AK', 'IA', 'A'.repeat(16)].join(''),
    assignment('DB_' + 'PASSWORD', 'synthetic-value'),
    assignment('access_' + 'token', 'synthetic-value', ': '),
    assignment('"pass' + 'word"', '"synthetic value"', ': '),
    assignment('api_' + 'key', "'synthetic value'", ': '),
  ];
  for (const input of inputs) {
    assert.throws(() => assertNoSecrets(input), /Secret-like/);
    assert.notEqual(redact(input), input);
    const diff = input.includes('\n') ? '\n--- untracked: output.txt\n' + input : '+' + input;
    assert.throws(() => guard({ entries: [{ file: 'output.txt' }], diff }, ['output.txt'], { allowed_paths: ['output.txt'], forbidden_paths: [] }), /Secret-like/);
  }
});
const description = {
  contract: { id: 'TASK-032', title: '개선 작업' },
  executor: { pr_overview: '반복 문제를 해결한다.', pr_changes: ['PR 본문 개선'], pr_follow_up: [] },
  reviewer: { verdict: 'PASS', findings: [{ message: '비차단 지적' }] },
  verification: [{ command: ['node', '--test'], code: 0 }],
  reviewCycle: 2, files: ['docs/example.md'], metadata: { diff_summary: '1 file changed' },
};
test('Korean PR describes work, review cycle, verification and handoff', () => {
  assert.equal(prTitle(description.contract), 'TASK-032 개선 작업');
  const body = prBody(description);
  for (const part of ['개요', '주요 변경', '검증', 'Review 결과', '회차: 2', '비차단 지적', '후속 작업 / 잔여 위험', 'Human Squash Merge', 'Auto Merge 없음', '<details>', 'Co-authored-by']) assert.ok(body.includes(part));
  assert.ok(body.indexOf('docs/example.md') > body.indexOf('<details>'));
});
test('PR length bounded and omitted content still checked for secrets', () => {
  const long = { ...description, executor: { ...description.executor, pr_overview: '가'.repeat(PR_BODY_LIMIT * 2) } };
  assert.ok(prBody(long).length <= PR_BODY_LIMIT);
  assert.ok(prBody(long).includes('생략'));
  for (const section of ['주요 변경', 'Review 결과', '승인 안내', 'Co-authored-by', '</details>']) assert.ok(prBody(long).includes(section));
  assert.throws(() => prBody({ ...long, executor: { ...long.executor, pr_follow_up: [assignment('pass' + 'word', 'synthetic-value')] } }), /Secret-like/);
});
test('limited PR preserves empty sections and Unicode boundaries', () => {
  const body = prBody({ ...description, reviewer: { verdict: 'PASS', findings: [] }, executor: { ...description.executor, pr_overview: '가'.repeat(4999) + '😀' + '가'.repeat(PR_BODY_LIMIT) } });
  assert.ok(body.includes('비차단 지적 없음'));
  assert.ok(body.includes('## 후속 작업 / 잔여 위험\n없음'));
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(body));
});
test('Executor PR fields are mandatory in both schemas', async () => {
  for (const name of ['executor-result.schema.json', 'executor-result.codex.schema.json']) {
    const schema = await readJson(new URL('../../harness/schemas/' + name, import.meta.url));
    const result = { status: 'DONE', changed_files: [], summary: '', verification: [], human_decisions_needed: [], handoff_actions: [], ...description.executor };
    validate(result, schema);
    for (const key of ['pr_overview', 'pr_changes', 'pr_follow_up']) {
      const missing = { ...result }; delete missing[key];
      assert.throws(() => validate(missing, schema), /Schema/);
    }
  }
});
test('Gate rework reaches PASS or limit without permission for Git', () => {
  const executor = { status: 'HUMAN_REQUIRED', human_decisions_needed: ['Decision'], handoff_actions: [] };
  assert.equal(decide(executor, { verdict: 'CHANGES_REQUIRED' }, 1).status, 'REWORK');
  const pass = decide(executor, { verdict: 'PASS' }, 2);
  assert.equal(pass.status, 'HUMAN_REQUIRED'); assert.match(pass.reason, /PASS cycle 2/);
  assert.match(decide(executor, { verdict: 'CHANGES_REQUIRED' }, 3).reason, /CHANGES_REQUIRED cycle 3/);
  assert.equal(decide(executor, { verdict: 'BLOCKED' }, 1).status, 'BLOCKED');
});
test('workspace name is short, stable and distinct', () => {
  assert.equal(workspaceName('run-one').length, 16);
  assert.equal(workspaceName('run-one'), workspaceName('run-one'));
  assert.notEqual(workspaceName('run-one'), workspaceName('run-two'));
});
