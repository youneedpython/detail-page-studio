import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Stop, blocked, readJson, redact, sanitize, validate, commandCheck, processRun, requireSuccess, safePath, inside, extractReviewer, git, changes, snapshot, guard, assertNoSecrets, ignoredSecrets, classify } from './lib.mjs';

import { acquireLock, createWorkspace, repositoryIdentity } from './workspace.mjs';
import { decide } from './state-machine.mjs';
import { guardAgents, validateAgentsSections } from './status-sync.mjs';
import { automateGit } from './git-automation.mjs';
import { validateSecretAllow, resumeContract, contractIdentity, resumeSourceRevision } from './lib.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../harness');
const exits = { PASS: 0, ERROR: 1, HUMAN_REQUIRED: 2, BLOCKED: 3, HANDOFF_PENDING: 0 };

export async function run(taskId, { root = process.cwd(), configPath = path.join(root, 'harness/config.local.json'), assetRoot = assets, resumeId, env = process.env } = {}) {
  const sourceRoot = root;
  if (resumeId && !/^[A-Za-z0-9-]+$/.test(resumeId)) blocked('Invalid resume id');
  const runId = resumeId ?? `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const runDir = path.join(root, '.harness/runs', runId);
  let state = { task_id: taskId, run_id: runId, phase: 'Preflight', status: 'RUNNING', review_cycles: 0, reason: '', history: [] };
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  let temporary, release, frozen, checkpoint = { cycle: 1, findings: [], executor: null };
  let baselineAgents, resumeAccepted = false, recordPrefix = '';
  const recordName = name => ['state.json', 'checkpoint.json', 'frozen.json'].includes(name) ? name : recordPrefix + name;
  const record = async (name, value) => writeFile(path.join(runDir, recordName(name)), (typeof value === 'string' ? redact(value) : JSON.stringify(sanitize(value), null, 2)) + '\n', 'utf8');
  const phase = async name => {
    if (controller.signal.aborted) blocked('interrupted');
    state.phase = name; state.history.push({ phase: name, cycle: state.review_cycles, at: new Date().toISOString() });
    await record('state.json', state);
  };
  const call = async (name, command, timeout, input = '', cwd = root) => {
    await record(`${name}.input.json`, { command, cwd, timeout, input });
    const result = await processRun(command, { cwd, timeout, input, signal: controller.signal, env });
    await record(`${name}.output.json`, result);
    return result;
  };
  const resumeSnapshot = async () => {
    const value = await snapshot(root);
    if (frozen && !frozen.workspace_created) {
      const activePath = `harness/tasks/${taskId}.json`;
      value.entries = value.entries.filter(entry => entry.file !== activePath);
      value.diff = await git(root, ['diff', 'HEAD', '--no-ext-diff', '--no-textconv', '--binary', '--', '.', `:(exclude)${activePath}`]);
      for (const entry of value.entries.filter(entry => entry.status === '??')) value.diff += `\n--- untracked: ${entry.file}\n${await readFile(await inside(root, entry.file), 'utf8')}\n`;
    }
    return value;
  };
  try {
    release = await acquireLock(sourceRoot, runId);
    if (resumeId) {
      state = await readJson(path.join(runDir, 'state.json'));
      if (!['HUMAN_REQUIRED', 'BLOCKED'].includes(state.status)) blocked('Run is not resumable');
      frozen = await readJson(path.join(runDir, 'frozen.json'));
      checkpoint = await readJson(path.join(runDir, 'checkpoint.json'));
      taskId = state.task_id;
      if (frozen.source_root !== sourceRoot || frozen.repository !== await repositoryIdentity(sourceRoot)) blocked('Resume repository mismatch');
      root = frozen.workspace;
      const sourceRevision = await resumeSourceRevision(sourceRoot, frozen.source_revision ?? frozen.revision, frozen.contract, frozen.contract_identity);
      if (frozen.workspace_created && (await git(root, ['rev-parse', 'HEAD'])).trim() !== frozen.revision) blocked('Resume HEAD mismatch');
      if (digest(await resumeSnapshot()) !== state.snapshot_hash) blocked('Resume diff mismatch; Human must inspect');
      let approval;
      try { approval = await readJson(path.join(runDir, 'resume-approval.json')); }
      catch { throw new Stop('HUMAN_REQUIRED', 'Resume requires Human approval tied to stopped reason and diff'); }
      if (approval.run_id !== runId || approval.snapshot_hash !== state.snapshot_hash || approval.stop_reason !== state.reason || approval.approved !== true || typeof approval.reference !== 'string' || !approval.reference.trim()) throw new Stop('HUMAN_REQUIRED', 'Resume requires Human approval tied to stopped reason and diff');
      const currentContract = await readJson(path.join(sourceRoot, 'harness/tasks', `${taskId}.json`)).catch(() => blocked('Resume contract malformed or missing'));
      frozen.contract = resumeContract(frozen.contract, currentContract, frozen.contract_identity);
      frozen.source_revision = sourceRevision;
      assertNoSecrets(JSON.stringify(approval), frozen.contract.secret_scan_allow, 'resume-approval', true);
      await record(`resume-${state.history.length}.json`, approval);
      await rm(path.join(runDir, 'resume-approval.json'));
      resumeAccepted = true;
      recordPrefix = `resume-${state.history.length}-`;
      if (checkpoint.pending_gate?.length || checkpoint.executor && (checkpoint.executor.status === 'HUMAN_REQUIRED' || checkpoint.executor.human_decisions_needed.length)) checkpoint.approved_cycle = checkpoint.cycle;
      else delete checkpoint.approved_cycle;
      state.status = 'RUNNING'; state.reason = '';
      delete state.secret_locations;
    }
    await mkdir(runDir, { recursive: true });
    await phase('Preflight');
    if (!/^TASK-\d{3}$/.test(taskId ?? '')) blocked('Usage: node scripts/orchestrator/run.mjs <TASK-ID> [--config <path>] | --resume <run-id>');
    if (Number(process.versions.node.split('.')[0]) !== 24) blocked('Node.js 24 required');
    if (path.resolve((await git(root, ['rev-parse', '--show-toplevel'], controller.signal)).trim()) !== path.resolve(root)) blocked('Run from repository root');
    const branch = (await git(root, ['branch', '--show-current'], controller.signal)).trim();
    if (!resumeId && (!branch || branch === 'main')) blocked('main or detached HEAD');
    if ((!resumeId || !frozen?.workspace_created) && (await changes(root, controller.signal)).some(entry => !resumeId || entry.file !== `harness/tasks/${taskId}.json`)) blocked('Working Tree is dirty');
    // Run records must be ignored before any agent is started.
    requireSuccess(await call('preflight-ignore', ['git', 'check-ignore', runDir + '/state.json'], 30000, '', sourceRoot), 'Run directory must be gitignored');
    let config, contract, executorSchema, codexSchema, reviewerSchema, executorTemplate, reviewerTemplate, taskText;
    try {
      config = frozen?.config ?? await readJson(configPath);
      contract = frozen?.contract ?? await readJson(path.join(root, 'harness/tasks', `${taskId}.json`));
      const contractSchema = frozen?.contractSchema ?? await readJson(path.join(assetRoot, 'schemas/task-contract.schema.json'));
      validate(contract, contractSchema);
      validateSecretAllow(contract.secret_scan_allow);
      if (contract.id !== taskId) blocked('Task id mismatch');
      validateAgentsSections(contract);
      for (const rule of [...contract.allowed_paths, ...contract.forbidden_paths]) safePath(rule, true);
      const taskPath = await inside(root, contract.task_file);
      taskText = frozen?.taskText ?? await readFile(taskPath, 'utf8');
      if (frozen?.task_identity) {
        taskText = await git(root, ['show', `${frozen.revision}:${contract.task_file}`]);
        if (digest(taskText.replace(/\r\n/g, '\n')) !== frozen.task_identity) blocked('Frozen Task document identity mismatch');
      }
      executorSchema = frozen?.executorSchema ?? await readJson(path.join(assetRoot, 'schemas/executor-result.schema.json'));
      codexSchema = frozen?.codexSchema ?? await readJson(path.join(assetRoot, 'schemas/executor-result.codex.schema.json'));
      reviewerSchema = frozen?.reviewerSchema ?? await readJson(path.join(assetRoot, 'schemas/reviewer-result.schema.json'));
      executorTemplate = frozen?.executorTemplate ?? await readFile(path.join(assetRoot, 'prompts/executor.md'), 'utf8');
      reviewerTemplate = frozen?.reviewerTemplate ?? await readFile(path.join(assetRoot, 'prompts/reviewer.md'), 'utf8');
      if (!executorTemplate.includes('{{INPUT}}') || !reviewerTemplate.includes('{{INPUT}}')) blocked('Missing prompt placeholder');
      commandCheck(config.codex?.command); commandCheck(config.claude?.command);
      if (!['elevated', 'unelevated'].includes(config.sandbox)) blocked('Sandbox must be elevated or unelevated');
      if (Object.hasOwn(config, 'git_automation') && typeof config.git_automation !== 'boolean') blocked('git_automation must be boolean');
      for (const key of ['preflight_ms', 'executor_ms', 'reviewer_ms', 'verify_ms']) if (!Number.isSafeInteger(config.timeouts?.[key]) || config.timeouts[key] <= 0) blocked(`Invalid timeout: ${key}`);
      for (const check of contract.verify) { commandCheck(check.command); if (check.cwd !== '.') await inside(root, check.cwd); }
    } catch (error) { if (error instanceof Stop) throw error; blocked(`Configuration / contract: ${error.code ?? error.name}`); }
    assertNoSecrets(JSON.stringify(config), [], 'configuration');
    const publicConfig = { ...config };
    await record('preflight.contract.json', contract);
    if (!frozen) {
      frozen = { source_root: sourceRoot, branch, repository: await repositoryIdentity(sourceRoot), workspace: root, workspace_created: false, revision: (await git(root, ['rev-parse', 'HEAD'])).trim(), config, contract, contractSchema: await readJson(path.join(assetRoot, 'schemas/task-contract.schema.json')), executorSchema, codexSchema, reviewerSchema, executorTemplate, reviewerTemplate, taskText };
      frozen.contract_identity = contractIdentity(contract);
      frozen.task_identity = digest(taskText.replace(/\r\n/g, '\n'));
      state.workspace = root;
      frozen.config = publicConfig;
      await record('frozen.json', frozen); await record('checkpoint.json', checkpoint);
    }
    const contractScan = { ...contract };
    delete contractScan.secret_scan_allow;
    assertNoSecrets(JSON.stringify(contractScan), contract.secret_scan_allow, 'task-contract', true);
    assertNoSecrets(taskText, contract.secret_scan_allow, contract.task_file);
    requireSuccess(await call('preflight-codex-version', [...config.codex.command, '--version'], config.timeouts.preflight_ms), 'Codex executable');
    const login = await call('preflight-login', [...config.codex.command, 'login', 'status'], config.timeouts.preflight_ms);
    if (login.failure) requireSuccess(login, 'Codex login process');
    requireSuccess(login, 'Codex login', true);
    requireSuccess(await call('preflight-claude-version', [...config.claude.command, '--version'], config.timeouts.preflight_ms), 'Claude executable');
    if (!frozen.workspace_created) {
      await phase('Workspace');
      const revision = (await git(sourceRoot, ['rev-parse', 'HEAD'])).trim();
      root = await createWorkspace(sourceRoot, runId, revision);
      try { baselineAgents = await readFile(path.join(root, 'AGENTS.md'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      frozen = { source_root: sourceRoot, branch: frozen.branch, repository: await repositoryIdentity(sourceRoot), workspace: root, workspace_created: true, revision, config, contract, contractSchema: frozen.contractSchema, executorSchema, codexSchema, reviewerSchema, executorTemplate, reviewerTemplate, taskText, baselineAgents: baselineAgents ?? null };
      frozen.contract_identity = contractIdentity(contract);
      frozen.task_identity = digest(taskText.replace(/\r\n/g, '\n'));
      frozen.config = publicConfig;
      await record('frozen.json', frozen);
      await record('checkpoint.json', checkpoint);
    } else baselineAgents = frozen.baselineAgents;
    state.workspace = root;
    state.workspace_name = path.basename(root);
    frozen.workspace_name = state.workspace_name;
    await record('frozen.json', frozen);
    if ((await ignoredSecrets(root)).length) blocked('Ignored secret file detected');
    temporary = await mkdtemp(path.join(os.tmpdir(), 'harness-result-'));
    const schemaFile = path.join(temporary, 'executor-schema.json');
    await writeFile(schemaFile, JSON.stringify(codexSchema));
    let findings = checkpoint.findings;
    for (let cycle = checkpoint.cycle; cycle <= contract.max_review_cycles; cycle++) {
      let executor = checkpoint.executor;
      if (!executor) {
        await phase('Execute');
        const resultFile = path.join(temporary, `executor-${cycle}.json`);
        const input = executorTemplate.replace('{{INPUT}}', () => JSON.stringify(sanitize({ contract, task_document: taskText, findings, result_schema: executorSchema }), null, 2));
        const execution = await call(`execute-${cycle}`, [...config.codex.command, 'exec', '-s', 'workspace-write', '-c', `windows.sandbox="${config.sandbox}"`, '--output-schema', schemaFile, '-o', resultFile, '-'], config.timeouts.executor_ms, input);
        requireSuccess(execution, 'Executor');
        await phase('Guard');
        try {
          const raw = await readFile(resultFile, 'utf8');
          await rm(resultFile, { force: true });
          await record(`executor-${cycle}.raw.txt`, raw);
          executor = JSON.parse(raw.replace(/^\uFEFF/, ''));
        } catch { blocked('Malformed Executor JSON / missing result'); }
        await record(`executor-${cycle}.json`, executor);
        validate(executor, executorSchema);
      } else await phase('Guard');
      const before = await snapshot(root, controller.signal);
      guard(before, executor.changed_files, contract);
      if ((await ignoredSecrets(root)).length) blocked('Ignored secret file detected');
      if (baselineAgents !== null && baselineAgents !== undefined && before.entries.some(x => x.file === 'AGENTS.md')) {
        guardAgents(baselineAgents, await readFile(path.join(root, 'AGENTS.md'), 'utf8'), await readFile(path.join(root, 'docs/07-TASKS.md'), 'utf8'), contract);
      }
      state.executor_request = { status: executor.status, human_decisions_needed: executor.human_decisions_needed, handoff_actions: executor.handoff_actions };
      checkpoint.executor = executor; checkpoint.cycle = cycle;
      await record('checkpoint.json', checkpoint);
      await record(`guard-${cycle}.json`, { changed_files: before.entries, matched: true });
      if (executor.status === 'FAILED') blocked('Executor FAILED');
      await phase('Verify');
      const verification = [];
      for (let i = 0; i < contract.verify.length; i++) {
        const check = contract.verify[i];
        const cwd = check.cwd === '.' ? root : await inside(root, check.cwd);
        const result = await call(`verify-${cycle}-${i + 1}`, check.command, config.timeouts.verify_ms, '', cwd);
        verification.push({ command: check.command, cwd: check.cwd, ...result });
        requireSuccess(result, 'Verify');
      }
      if ((await ignoredSecrets(root)).length) blocked('Ignored secret file detected');
      if (JSON.stringify(before) !== JSON.stringify(await snapshot(root, controller.signal))) blocked('Verify changed Working Tree');
      if (state.review_cycles >= contract.max_review_cycles) throw new Stop('HUMAN_REQUIRED', 'Review limit reached (3)');
      await phase('Review'); state.review_cycles++; await record('state.json', state);
      const reviewerInput = reviewerTemplate.replace('{{INPUT}}', () => JSON.stringify(sanitize({ contract, task_document: taskText, diff: before.diff, verify_logs: verification, result_schema: reviewerSchema }), null, 2));
      const review = await call(`review-${cycle}`, [...config.claude.command, '-p', '--output-format', 'json', '--allowedTools', 'Read,Grep,Glob', '--tools', 'Read,Grep,Glob', '--strict-mcp-config'], config.timeouts.reviewer_ms, reviewerInput);
      requireSuccess(review, 'Reviewer');
      let verdict;
      try { verdict = extractReviewer(review.stdout); } catch (error) { if (error instanceof Stop) throw error; blocked('Malformed Reviewer JSON'); }
      validate(verdict, reviewerSchema);
      if (verdict.verdict === 'CHANGES_REQUIRED' && !verdict.findings.length) blocked('CHANGES_REQUIRED needs findings');
      await record(`reviewer-${cycle}.json`, verdict);
      if ((await ignoredSecrets(root)).length) blocked('Ignored secret file detected');
      if (JSON.stringify(before) !== JSON.stringify(await snapshot(root, controller.signal))) blocked('Reviewer changed Working Tree');
      await phase('Decide');
      state.executor_request = { status: executor.status, human_decisions_needed: executor.human_decisions_needed, handoff_actions: executor.handoff_actions };
      state.reviewer_verdict = verdict;
      const pending = checkpoint.pending_gate ?? [];
      const effective = checkpoint.approved_cycle === cycle ? { ...executor, status: 'DONE', human_decisions_needed: [] }
        : { ...executor, human_decisions_needed: [...new Set([...pending, ...executor.human_decisions_needed])] };
      const decision = decide(effective, verdict, state.review_cycles, contract.max_review_cycles);
      state.status = decision.status; state.reason = decision.reason;
      // Git automation stays off until Human enables it after GitHub remote / Ruleset setup.
      if (['PASS', 'HANDOFF_PENDING'].includes(decision.status) && config.git_automation === true) {
        await phase('Git');
        state.git = await automateGit({ sourceRoot, workspace: root, revision: frozen.source_revision ?? frozen.revision, branch: frozen.branch, contract, status: state.status, executor: effective, reviewer: verdict, verification, reviewCycle: state.review_cycles, reviewed: before, record, runDir, signal: controller.signal });
        state.status = 'HANDOFF_PENDING';
      }
      if (decision.status !== 'REWORK') break;
      findings = verdict.findings;
      checkpoint = { cycle: cycle + 1, findings, executor: null, pending_gate: effective.human_decisions_needed.length ? effective.human_decisions_needed : effective.status === 'HUMAN_REQUIRED' && !effective.handoff_actions.length ? ['Executor Human Gate'] : [] };
      await record('checkpoint.json', checkpoint);
    }
  } catch (error) {
    state.status = error instanceof Stop ? error.status : 'ERROR';
    state.reason = error.message; state.error_category = error.category ?? classify(error.message);
    if (error.locations) state.secret_locations = error.locations;
  } finally {
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    if (temporary) await rm(temporary, { recursive: true, force: true });
    if (release && (!resumeId || resumeAccepted) && state.workspace) {
      try { state.snapshot_hash = digest(await resumeSnapshot()); } catch { state.snapshot_hash = null; }
    }
    state.finished_at = new Date().toISOString();
    if (release) {
      try { if (!resumeId || resumeAccepted) { await mkdir(runDir, { recursive: true }); await record('state.json', state); } }
      finally {
        try { await release(); }
        catch (error) {
          state.status = 'BLOCKED';
          state.reason = 'Repository lock release failed; Human must inspect lock before another run';
          state.error_category = 'lock';
          state.lock_error = { message: redact(error.message), code: error.code ?? error.status ?? error.name };
          await mkdir(runDir, { recursive: true });
          await record('state.json', state);
        }
      }
    }
  }
  return { status: state.status, code: exits[state.status] ?? 1, run_dir: runDir, state };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const resumeId = args[0] === '--resume' ? args[1] : undefined;
  if (!(args.length === 1 || (args.length === 3 && args[1] === '--config') || (args.length === 2 && resumeId))) {
    process.stderr.write('Usage: node scripts/orchestrator/run.mjs <TASK-ID> [--config <path>] | --resume <run-id>\n'); process.exitCode = 3;
  } else {
    try {
      const result = await run(resumeId ? undefined : args[0], { resumeId, configPath: args[2] ? path.resolve(args[2]) : undefined });
      process.stdout.write(redact(JSON.stringify({ status: result.status, run_dir: result.run_dir, reason: result.state.reason })) + '\n');
      process.exitCode = result.code;
    } catch (error) { process.stderr.write(redact(error.message) + '\n'); process.exitCode = 1; }
  }
}
