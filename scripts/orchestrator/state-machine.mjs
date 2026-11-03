// Executor requests and reviewer verdicts are independent evidence.
export function decide(executor, reviewer, cycle, maximum = 3) {
  const decisions = executor.human_decisions_needed;
  const handoff = executor.handoff_actions;
  if (reviewer.verdict === 'BLOCKED') return { status: 'BLOCKED', reason: 'Reviewer BLOCKED' };
  if (reviewer.verdict === 'CHANGES_REQUIRED') {
    return cycle >= maximum
      ? { status: 'HUMAN_REQUIRED', reason: `Review limit reached (${maximum}); CHANGES_REQUIRED cycle ${cycle}; ${decisions.join('; ')}` }
      : { status: 'REWORK', reason: 'Reviewer findings' };
  }
  if (decisions.length || (executor.status === 'HUMAN_REQUIRED' && !handoff.length)) {
    return { status: 'HUMAN_REQUIRED', reason: `${decisions.join('; ') || 'Executor Human Gate'}; ${reviewer.verdict} cycle ${cycle}` };
  }
  if (reviewer.verdict === 'HUMAN_REQUIRED') return { status: 'HUMAN_REQUIRED', reason: reviewer.findings.map(x => x.message).join('; ') };
  return { status: handoff.length ? 'HANDOFF_PENDING' : 'PASS', reason: handoff.join('; ') };
}
