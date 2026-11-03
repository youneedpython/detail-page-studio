import { readFile, writeFile } from 'node:fs/promises';
const [scenario, role, ...args] = process.argv.slice(2);
if (args.includes('--version')) { console.log('Fake CLI 1.0'); process.exit(0); }
if (args[0] === 'login') { if (scenario === 'login') process.exit(1); console.log('Logged in'); process.exit(0); }
let input = '';
for await (const chunk of process.stdin) input += chunk;
if (role === 'verify') { console.log('verification output'); if (scenario === 'verify-sandbox') { console.error('integration: sandbox'); process.exit(1); } if (scenario === 'verify') process.exit(1); if (scenario === 'verify-mutation') await writeFile('output.txt', 'verify mutation'); process.exit(0); }
if (role === 'executor') {
  console.error('sandbox: workspace-write [workdir, /tmp, $TMPDIR]\nmodel: fake\napproval: never');
  try {
    const index = args.indexOf('--output-schema');
    if (index < 0 || !args[index + 1]) throw new Error('Missing output schema');
    const schema = JSON.parse(await readFile(args[index + 1], 'utf8'));
    const check = node => {
      const allowed = new Set(['type', 'enum', 'required', 'properties', 'additionalProperties', 'items']);
      for (const key of Object.keys(node)) if (!allowed.has(key)) throw new Error('Unsupported keyword: ' + key);
      if (node.type === 'object') {
        const keys = Object.keys(node.properties ?? {});
        if (node.additionalProperties !== false || !Array.isArray(node.required) || node.required.length !== keys.length || keys.some(key => !node.required.includes(key))) throw new Error('Object must require all properties and reject additional properties');
      }
      for (const child of Object.values(node.properties ?? {})) check(child);
      if (node.items) check(node.items);
    };
    check(schema);
  } catch (error) {
    console.error('invalid_request_error / invalid_json_schema: ' + error.message);
    process.exit(1);
  }
  if (scenario === 'executor-failure') { console.error('failure'); process.exit(1); }
  if (scenario === 'executor-auth') { console.error('Error: authentication failed: login expired'); process.exit(1); }
  if (scenario === 'sandbox') { console.error('sandbox permission denied'); process.exit(1); }
  if (scenario === 'quota') { console.error('usage limit reached'); process.exit(1); }
  if (scenario === 'timeout') await new Promise(resolve => setTimeout(resolve, 60000));
  if (!args.includes('workspace-write') || !['windows.sandbox="unelevated"', 'windows.sandbox="elevated"'].some(value => args.includes(value)) || args.at(-1) !== '-') process.exit(9);
  const file = scenario === 'path' ? 'forbidden.txt' : scenario === 'secret-file' ? '.env.local' : 'output.txt';
  let previous = ''; try { previous = await readFile(file, 'utf8'); } catch {}
  const cycle = previous.includes('cycle=1') ? 2 : previous.includes('cycle=2') ? 3 : 1;
  if (cycle > 1 && !input.includes('fix this')) process.exit(8);
  await writeFile(file, scenario === 'secret-content' ? ['api', 'key'].join('_') + '=' + ['sk', 'synthetic0123456789'].join('-') : `cycle=${cycle}\nnew content\n`);
  if (scenario === 'agents-sync') {
    const agents = await readFile('AGENTS.md', 'utf8');
    await writeFile('AGENTS.md', agents.replace('TASK-020 old', 'TASK-021 next').replace('IN_PROGRESS', 'BLOCKED'));
  }
  const result = { status: scenario === 'executor-human' ? 'HUMAN_REQUIRED' : scenario === 'executor-status-failure' ? 'FAILED' : 'DONE', changed_files: scenario === 'mismatch' ? [] : [file], pr_overview: 'fixture description', pr_changes: ['fixture description'], pr_follow_up: [], summary: 'EXECUTOR_SELF_DESCRIPTION_MUST_NOT_REACH_REVIEWER', verification: [], human_decisions_needed: scenario === 'executor-human' ? ['Approve Task decision'] : [], handoff_actions: scenario === 'handoff' ? ['Approved role prepares PR'] : [] };
  if (scenario.startsWith('gate-') && cycle === 1) { result.status = 'HUMAN_REQUIRED'; result.human_decisions_needed = ['Approve Task decision']; }
  if (scenario === 'executor-schema') result.status = 'PASS';
  if (scenario === 'agents-sync') result.changed_files.push('AGENTS.md');
  if (scenario === 'secret') result.summary += ' api_key=sk-fake0123456789';
  await writeFile(args[args.indexOf('-o') + 1], scenario === 'executor-json' ? '{wrong' : JSON.stringify(result));
} else {
  if (input.includes('EXECUTOR_SELF_DESCRIPTION_MUST_NOT_REACH_REVIEWER') || !input.includes('new content') || !input.includes('verification output') || !args.includes('Read,Grep,Glob')) process.exit(7);
  let verdict = 'PASS';
  if (scenario === 'human') verdict = 'HUMAN_REQUIRED';
  if (scenario === 'blocked') verdict = 'BLOCKED';
  if (scenario === 'limit' || (scenario === 'rework' && input.includes('cycle=1'))) verdict = 'CHANGES_REQUIRED';
  if (scenario === 'gate-limit' || (scenario === 'gate-rework' && input.includes('cycle=1'))) verdict = 'CHANGES_REQUIRED';
  if (scenario === 'gate-blocked') verdict = 'BLOCKED';
  if (scenario === 'reviewer-schema') verdict = 'UNKNOWN';
  if (scenario === 'reviewer-mutation') await writeFile('output.txt', 'review mutation');
  const findings = verdict === 'PASS' ? [] : [{ id: 'F1', message: 'fix this', path: 'output.txt' }];
  const json = JSON.stringify({ verdict, findings });
  console.log(scenario === 'reviewer-json' ? '{wrong' : JSON.stringify({ result: scenario === 'wrapped' ? `Explanation\n\`\`\`json\n${json}\n\`\`\`` : json }));
}
