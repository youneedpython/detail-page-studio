import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { checkRemoteConflict } from './pr-gate.mjs';
import { prTitle, prBody } from './pr-description.mjs';
import { Stop, blocked, guard, changes, snapshot, git, inside, ignoredSecrets, secretFile, processRun, assertNoSecrets } from './lib.mjs';

const codex = 'Co-authored-by: Codex <199175422+chatgpt-codex-connector[bot]@users.noreply.github.com>';
const claude = 'Co-authored-by: Claude <noreply@anthropic.com>';

export function gitPolicy({ contract, branch, status, executor, reviewer, verification, force = false, merge = false }) {
  if (!new RegExp(`^task/${contract.id}-[a-z0-9][a-z0-9-]*$`).test(branch)) blocked('Git requires approved Task branch');
  if (force || merge) blocked('Force Push / Merge / Auto Merge forbidden');
  if (!['PASS', 'HANDOFF_PENDING'].includes(status) || executor.status !== 'DONE' || executor.human_decisions_needed.length || reviewer.verdict !== 'PASS') blocked('Git requires DONE, Claude PASS and no Human Gate');
  if (!verification.length || verification.length !== contract.verify.length || verification.some(x => x.code !== 0 || x.failure)) blocked('Git requires successful deterministic Verification');
}

// Called only by the Orchestrator after Decide; never exposed as an Executor tool.
export async function automateGit({ sourceRoot, workspace, revision, branch, contract, status, executor, reviewer, verification, reviewCycle = 1, reviewed, record, runDir, signal, invoke = processRun }) {
  gitPolicy({ contract, branch, status, executor, reviewer, verification });
  guard(reviewed, executor.changed_files, contract);
  if ((await ignoredSecrets(workspace)).length) blocked('Ignored secret file detected in Workspace before Git');
  if (JSON.stringify(await snapshot(workspace)) !== JSON.stringify(reviewed)) blocked('Reviewed diff changed before Git');
  const checkSource = async () => {
    if ((await git(sourceRoot, ['branch', '--show-current'])).trim() !== branch || (await git(sourceRoot, ['rev-parse', 'HEAD'])).trim() !== revision) blocked('Git branch / HEAD conflict');
    if ((await changes(sourceRoot)).length) blocked('Dirty Working Tree conflict before Git');
  };
  await checkSource();
  let sequence = 0;
  const command = async (args, input = '', auth = false) => {
    const result = await invoke(args, { cwd: sourceRoot, timeout: 30000, signal, input, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1' } });
    // Authentication output contains account details: store only exit/failure evidence.
    await record(`git-command-${++sequence}.json`, { command: args, code: result.code, failure: result.failure ?? null });
    if (result.code !== 0 || result.failure) {
      if (result.failure && !/ENOENT/.test(result.failure)) blocked(`Git process failed: ${result.failure}`);
      if (auth || /authentication|credential|could not read username|permission denied|not logged/i.test(result.stderr ?? '')) throw new Stop('HUMAN_REQUIRED', 'GitHub / Git authentication unavailable; Human login required');
      blocked('Git operation failed; inspect audit, no automatic retry');
    }
    return result.stdout;
  };
  await command(['gh', 'auth', 'status'], '', true);
  await command(['git', 'ls-remote', '--exit-code', 'origin', 'refs/heads/main']);
  const repository = JSON.parse(await command(['gh', 'repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) blocked('Invalid GitHub repository identity');
  const remoteGuard = () => checkRemoteConflict(args => command(['gh', ...args]), { repository, head: branch, task_id: contract.id, revision });
  await remoteGuard();
  await checkSource();
  const files = reviewed.entries.map(x => x.file);
  if (!files.length) blocked('No reviewed changes to commit');
  const metadata = { task_id: contract.id, repository, base: 'main', head: branch, revision, changed_files: files, diff_summary: await git(workspace, ['diff', '--stat', 'HEAD']), verification, review_verdict: reviewer.verdict, human_gate: 'none pending', draft: true };
  const body = prBody({ contract, executor, reviewer, verification, reviewCycle, files, metadata });
  assertNoSecrets(prTitle(contract), contract.secret_scan_allow, 'pr-title');
  await record('git-pre-pr.json', metadata);
  const patch = await git(workspace, ['diff', 'HEAD', '--binary', '--no-ext-diff', '--no-textconv', '--']);
  if (patch) await command(['git', 'apply', '--check', '--binary', '-'], patch);
  if (patch) await command(['git', 'apply', '--binary', '-'], patch);
  for (const entry of reviewed.entries.filter(x => x.status === '??')) {
    const parts = entry.file.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      const relative = parts.slice(0, depth).join('/');
      try { await mkdir(path.join(sourceRoot, relative)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      await inside(sourceRoot, relative);
    }
    await writeFile(path.join(sourceRoot, entry.file), await readFile(await inside(workspace, entry.file)), { flag: 'wx' });
  }
  const transferred = await snapshot(sourceRoot);
  guard(transferred, files, contract);
  if (transferred.diff !== reviewed.diff) blocked('Transferred diff differs from reviewed diff');
  // Literal pathspecs prevent filenames from being interpreted as globs or magic.
  for (const file of files) await command(['git', '--literal-pathspecs', 'add', '--', file]);
  const checkStaged = async () => {
    const staged = (await git(sourceRoot, ['diff', '--cached', '--name-only', '-z'])).split('\0').filter(Boolean).sort();
    if (staged.some(secretFile)) blocked('Secret file detected in staged paths');
    if (JSON.stringify(staged) !== JSON.stringify([...files].sort())) blocked('Staged allowlist mismatch');
  };
  await checkStaged();
  guard(await snapshot(sourceRoot), files, contract);
  if ((await git(sourceRoot, ['branch', '--show-current'])).trim() !== branch || (await git(sourceRoot, ['rev-parse', 'HEAD'])).trim() !== revision || await git(sourceRoot, ['diff', '--no-ext-diff', '--no-textconv', '--'])) blocked('Git conflict before Commit');
  if (JSON.stringify(await snapshot(workspace)) !== JSON.stringify(reviewed)) blocked('Reviewed diff changed before Commit');
  for (const entry of reviewed.entries.filter(x => !x.status.includes('D'))) {
    // Apply Source's Git clean filters (including autocrlf and attributes) to
    // reviewed bytes, then compare with the blob that will actually be committed.
    const expected = (await git(sourceRoot, ['hash-object', '--path', entry.file, '--', await inside(workspace, entry.file)])).trim();
    const staged = (await git(sourceRoot, ['rev-parse', `:${entry.file}`])).trim();
    if (staged !== expected) blocked('Reviewed content changed before Commit');
  }
  const message = `${prTitle(contract)}\n\n- ${contract.title}\n\n${codex}\n${claude}\n`;
  assertNoSecrets(message, contract.secret_scan_allow, 'commit-message');
  await checkStaged();
  await remoteGuard();
  const expectedTree = (await git(sourceRoot, ['write-tree'])).trim();
  await command(['git', 'commit', '-F', '-'], message);
  metadata.commit_sha = (await git(sourceRoot, ['rev-parse', 'HEAD'])).trim();
  await record('git-pre-pr.json', metadata);
  if ((await git(sourceRoot, ['rev-parse', 'HEAD^{tree}'])).trim() !== expectedTree || (await git(sourceRoot, ['rev-parse', 'HEAD^'])).trim() !== revision) blocked('Committed tree / parent differs from reviewed content');
  if ((await changes(sourceRoot)).length || (await git(sourceRoot, ['branch', '--show-current'])).trim() !== branch) blocked('Git conflict after Commit');
  await remoteGuard();
  await command(['git', 'push', 'origin', `${metadata.commit_sha}:refs/heads/${branch}`]);
  assertNoSecrets(body, contract.secret_scan_allow, 'pr-body');
  const bodyFile = path.join(runDir, 'git-pr-body.md');
  await writeFile(bodyFile, body, 'utf8');
  await record('git-pr-body.md', body);
  metadata.pr_url = (await command(['gh', 'pr', 'create', '--draft', '--base', 'main', '--head', branch, '--title', prTitle(contract), '--body-file', bodyFile])).trim();
  const created = JSON.parse(await command(['gh', 'pr', 'view', metadata.pr_url, '--repo', repository, '--json', 'number,headRefOid,headRefName,baseRefName']));
  if (!Number.isSafeInteger(created.number) || created.headRefOid !== metadata.commit_sha || created.headRefName !== branch || created.baseRefName !== 'main') blocked('Created PR identity conflict');
  metadata.pr_number = created.number;
  await record('git-result.json', metadata);
  return metadata;
}
