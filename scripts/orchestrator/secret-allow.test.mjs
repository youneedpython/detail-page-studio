import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoSecrets, validateSecretAllow, scanCopy, redact, sanitize, guard, resumeContract, readJson, validate, processRun } from './lib.mjs';
import { run } from './run.mjs';
import { prBody } from './pr-description.mjs';

const assign = (name, value = 'fixture-value') => name + '=' + value;
const approved = [
  ['Secret', ': Human documentation'].join(''),
  ['secret', ':resource-kind'].join(''),
  assign('example_' + 'token', 'documentation'),
];
test('literal approvals cover historical false positives and preserve strict masking', () => {
  for (const item of approved) {
    assert.throws(() => assertNoSecrets(item), /Secret-like/);
    assert.doesNotThrow(() => assertNoSecrets(item, [item]));
    assert.notEqual(redact(item), item);
    assert.notEqual(sanitize({ text: item }).text, item);
    assert.throws(() => assertNoSecrets(item.toUpperCase(), [item]), /Secret-like/);
    assert.throws(() => assertNoSecrets(item.slice(0, -1), [item]), /Secret-like/);
    const other = assign('pass' + 'word');
    for (const text of [other + item, item + other, item + ' ' + other]) assert.throws(() => assertNoSecrets(text, [item]), /Secret-like/);
    assert.throws(() => assertNoSecrets(item, []), /Secret-like/);
  }
});
test('overlap, literal metacharacters and JSON escaping have deterministic results', () => {
  const item = assign('api_' + 'key', '"quoted\\path.*[x]"');
  assert.doesNotThrow(() => assertNoSecrets(JSON.stringify({ text: item }), [item], 'serialized', true));
  assert.throws(() => assertNoSecrets(JSON.stringify({ text: item }), [item]), /Secret-like/);
  assert.doesNotThrow(() => assertNoSecrets(item, [item]));
  assert.equal(scanCopy(item, [item.slice(0, -3), item]), scanCopy(item, [item, item.slice(0, -3)]));
  assert.throws(() => assertNoSecrets(item.replace('quoted', 'changed'), [item]), /Secret-like/);
});
test('format restrictions and credential forms reject unsafe approvals', async () => {
  const schema = await readJson(new URL('../../harness/schemas/task-contract.schema.json', import.meta.url));
  const formats = [
    ['Bear', 'er fixture-value'].join(''), ['sk', '-abcdefghijk'].join(''),
    ['ghp', '_abcdefghijk'].join(''), ['github', '_pat_abcdefghijk'].join(''),
    ['AK', 'IA', 'A'.repeat(16)].join(''), ['AS', 'IA', 'A'.repeat(16)].join(''),
    ['https://user', ':fixture-value@example.invalid'].join(''),
    ['https://', ':fixture-value@example.invalid'].join(''),
    ['-'.repeat(5), 'BEGIN ', ['PRIVATE', 'KEY'].join(' '), '-'.repeat(5), '\nx\n', '-'.repeat(5), 'END ', ['PRIVATE', 'KEY'].join(' '), '-'.repeat(5)].join(''),
  ];
  for (const item of formats) assert.throws(() => validateSecretAllow([item]), /Contract/);
  for (const items of [['ab'], ['x'.repeat(201)], [' abc'], ['abc '], ['a\nb'], ['a\tb'], ['a\u007fb'], ['a\u2028b'], ['abc', 'abc'], Array.from({ length: 51 }, (_, i) => 'item' + i), 'abc', [3]]) assert.throws(() => validateSecretAllow(items), /Contract/);
  for (const items of [['ab'], ['x'.repeat(201)], ['abc', 'abc'], Array.from({ length: 51 }, (_, i) => 'item' + i)]) assert.throws(() => validate(items, schema.properties.secret_scan_allow), /Schema/);
  assert.doesNotThrow(() => validateSecretAllow([]));
  assert.doesNotThrow(() => validateSecretAllow(approved));
});
test('approved literals cannot become wildcard keys or partial assignment values', () => {
  for (const item of approved) {
    for (const extra of ['suffix', '_suffix', '-suffix', '/suffix', '.suffix']) {
      assert.throws(() => assertNoSecrets(item + extra, [item]), /Secret-like/);
    }
  }
  for (const name of ['pass' + 'word', 'api_' + 'key', 'secret' + '_extra']) {
    for (const item of [name, name + ':', name + '=', name + ': ']) assert.throws(() => validateSecretAllow([item]), /Contract/);
  }
});
test('strengthened formats block and mask, including suffixed object fields', () => {
  const inputs = [
    ['AS', 'IA', 'A'.repeat(16)].join(''),
    ['https://user', ':fixture-value@example.invalid/path'].join(''),
    assign(['AWS', 'SECRET', 'ACCESS', 'KEY'].join('_')),
    assign('api_' + 'key_extra'), assign('pass' + 'word-extra'), assign('secret' + 'AccessKey'),
  ];
  for (const text of inputs) {
    assert.throws(() => assertNoSecrets(text), /Secret-like/);
    assert.notEqual(redact(text), text);
  }
  const key = ['AWS', 'SECRET', 'ACCESS', 'KEY'].join('_');
  assert.equal(sanitize({ [key]: 'fixture-value' })[key], '[REDACTED]');
});
test('Guard records file and new-line coordinates without values', () => {
  const text = assign('pass' + 'word', 'private-fixture-value');
  const contract = { allowed_paths: ['output.txt'], forbidden_paths: [] };
  for (const [diff, line] of [['diff --git a/output.txt b/output.txt\n+++ b/output.txt\n@@ -8,0 +9,2 @@\n+safe\n+' + text, 10], ['\n--- untracked: output.txt\nsafe\n' + text + '\n', 2]]) {
    assert.throws(() => guard({ entries: [{ file: 'output.txt' }], diff }, ['output.txt'], contract), error => {
      assert.deepEqual(error.locations, [{ source: 'output.txt', line, rule: 'assignment' }]);
      assert.ok(!JSON.stringify(error).includes('private-fixture-value'));
      return true;
    });
  }
  const diff = '+' + approved[0];
  assert.doesNotThrow(() => guard({ entries: [{ file: 'output.txt' }], diff }, ['output.txt'], { ...contract, secret_scan_allow: [approved[0]] }));
});
test('Resume changes only approved literals and rejects nested contract changes', () => {
  const original = { id: 'TASK-019', verify: [{ command: ['node'], cwd: '.' }] };
  assert.deepEqual(resumeContract(original, { ...original, secret_scan_allow: approved }).secret_scan_allow, approved);
  assert.throws(() => resumeContract(original, { ...original, verify: [{ command: ['other'], cwd: '.' }], secret_scan_allow: approved }), /fields changed/);
  assert.throws(() => resumeContract(original, { ...original, secret_scan_allow: [['AS', 'IA', 'A'.repeat(16)].join('')] }), /credential/);
});
test('PR scanning uses approvals but checks adjacent and omitted material', () => {
  const input = { contract: { id: 'TASK-034', title: '문구 검사', secret_scan_allow: approved }, executor: { pr_overview: approved[0], pr_changes: [], pr_follow_up: [] }, reviewer: { verdict: 'PASS' }, verification: [], files: [], metadata: { diff_summary: '' } };
  assert.ok(prBody(input).includes(approved[0]));
  assert.throws(() => prBody({ ...input, executor: { ...input.executor, pr_follow_up: [assign('pass' + 'word')] } }), /Secret-like/);
});

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-allow-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fake = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url));
  const invoke = async (...args) => {
    const result = await processRun(['git', ...args], { cwd: root, timeout: 10000 });
    assert.equal(result.code, 0, result.stderr);
  };
  await invoke('init', '-b', 'task/test');
  await mkdir(path.join(root, 'harness/tasks'), { recursive: true });
  await writeFile(path.join(root, '.gitignore'), '.harness/runs/\n.harness/workspaces/\nharness/config.local.json\n');
  await writeFile(path.join(root, 'task.md'), approved[0]);
  const contract = { id: 'TASK-019', title: 'Fake task', task_file: 'task.md', allowed_paths: ['output.txt'], forbidden_paths: [], verify: [{ command: [process.execPath, fake, 'pass', 'verify'], cwd: '.' }], max_review_cycles: 3 };
  const contractPath = path.join(root, 'harness/tasks/TASK-019.json');
  await writeFile(contractPath, JSON.stringify(contract));
  await invoke('add', '.');
  await invoke('-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
  await writeFile(path.join(root, 'harness/config.local.json'), JSON.stringify({ codex: { command: [process.execPath, fake, 'pass', 'executor'] }, claude: { command: [process.execPath, fake, 'pass', 'reviewer'] }, sandbox: 'unelevated', timeouts: { preflight_ms: 10000, executor_ms: 10000, reviewer_ms: 10000, verify_ms: 10000 } }));
  return { root, contract, contractPath };
}
test('Fake CLI preflight stop, Human allowlist update, approval and frozen Resume', async t => {
  const { root, contract, contractPath } = await fixture(t);
  const stopped = await run('TASK-019', { root });
  assert.equal(stopped.status, 'BLOCKED', stopped.state.reason);
  assert.deepEqual(stopped.state.secret_locations, [{ source: 'task.md', line: 1, rule: 'assignment' }]);
  assert.ok(!(await readFile(path.join(stopped.run_dir, 'state.json'), 'utf8')).includes('Human documentation'));
  await writeFile(contractPath, JSON.stringify({ ...contract, secret_scan_allow: [approved[0]] }));
  const denied = await run(undefined, { root, resumeId: stopped.state.run_id });
  assert.equal(denied.status, 'HUMAN_REQUIRED');
  const approvalFile = path.join(stopped.run_dir, 'resume-approval.json');
  await writeFile(approvalFile, JSON.stringify({ approved: true, run_id: stopped.state.run_id, snapshot_hash: stopped.state.snapshot_hash, stop_reason: stopped.state.reason, reference: 'Human fixture approval' }));
  await writeFile(contractPath, JSON.stringify({ ...contract, title: 'changed', secret_scan_allow: [approved[0]] }));
  const changed = await run(undefined, { root, resumeId: stopped.state.run_id });
  assert.equal(changed.status, 'BLOCKED');
  assert.match(changed.state.reason, /fields changed/);
  await writeFile(contractPath, JSON.stringify({ ...contract, secret_scan_allow: [approved[0]] }));
  const resumed = await run(undefined, { root, resumeId: stopped.state.run_id });
  assert.equal(resumed.status, 'PASS', resumed.state.reason);
  const input = await readFile(path.join(stopped.run_dir, 'resume-1-execute-1.input.json'), 'utf8');
  assert.ok(!input.includes('Human documentation'));
  assert.ok(input.includes('[REDACTED]'));
});
test('Fake CLI Guard stop resumes the existing workspace with committed Human literals', async t => {
  const { root, contract, contractPath } = await fixture(t);
  await writeFile(path.join(root, 'task.md'), 'Safe task');
  const invoke = async (...args) => {
    const result = await processRun(['git', ...args], { cwd: root, timeout: 10000 });
    assert.equal(result.code, 0, result.stderr);
  };
  await invoke('add', '--', 'task.md');
  await invoke('-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'safe document');
  const producer = path.join(root, 'producer.mjs');
  const fake = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url));
  await writeFile(producer, `import {writeFile} from 'node:fs/promises'; const args=process.argv.slice(2); if(args.includes('--version')||args[0]==='login'){process.exit(0)}; for await(const chunk of process.stdin){}; await writeFile('output.txt', ${JSON.stringify(approved[0])}+'\\nnew content\\n'); await writeFile(args[args.indexOf('-o')+1],JSON.stringify({status:'DONE',changed_files:['output.txt'],summary:'fixture',verification:[],human_decisions_needed:[],handoff_actions:[],pr_overview:'fixture',pr_changes:[],pr_follow_up:[]}));`);
  await invoke('add', '--', 'producer.mjs');
  await invoke('-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture producer');
  const configPath = path.join(root, 'harness/config.local.json');
  const config = await readJson(configPath);
  config.codex.command = [process.execPath, producer];
  config.claude.command = [process.execPath, fake, 'pass', 'reviewer'];
  await writeFile(configPath, JSON.stringify(config));
  const stopped = await run('TASK-019', { root });
  assert.equal(stopped.status, 'BLOCKED', stopped.state.reason);
  assert.equal(stopped.state.phase, 'Guard');
  await writeFile(contractPath, JSON.stringify({ ...contract, secret_scan_allow: [approved[0]] }));
  await invoke('add', '--', 'harness/tasks/TASK-019.json');
  await invoke('-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Human literal approval');
  await writeFile(path.join(stopped.run_dir, 'resume-approval.json'), JSON.stringify({ approved: true, run_id: stopped.state.run_id, snapshot_hash: stopped.state.snapshot_hash, stop_reason: stopped.state.reason, reference: 'Human fixture approval' }));
  const resumed = await run(undefined, { root, resumeId: stopped.state.run_id });
  assert.equal(resumed.status, 'PASS', resumed.state.reason);
});
