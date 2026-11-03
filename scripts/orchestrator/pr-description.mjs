import { assertNoSecrets } from './lib.mjs';

export const PR_BODY_LIMIT = 24000;
export function prTitle(contract) { return `${contract.id} ${contract.title}`; }
function render({ contract, executor, reviewer, verification, verificationText, reviewCycle = 1, files, metadata }) {
  const body = `${prTitle(contract)}

## 개요
${executor.pr_overview}

## 주요 변경
${executor.pr_changes.map(x => '- ' + x).join('\n')}

## 검증
${verificationText ?? verification.map(x => '- ' + x.command.join(' ') + ': exit ' + x.code).join('\n')}

## Review 결과
판정: ${reviewer.verdict}, 회차: ${reviewCycle}
${(reviewer.findings ?? []).map(x => '- ' + x.message).join('\n') || '비차단 지적 없음'}

## 후속 작업 / 잔여 위험
${executor.pr_follow_up.map(x => '- ' + x).join('\n') || '없음'}

## 승인 안내
미해결 Human Gate 없음. Human Squash Merge 필요. Auto Merge 없음.

Co-authored-by: Codex <199175422+chatgpt-codex-connector[bot]@users.noreply.github.com>
Co-authored-by: Claude <noreply@anthropic.com>

<details>
<summary>파일 목록 / Diff 통계</summary>

${files.map(x => '- ' + x).join('\n')}

${metadata.diff_summary}
</details>
`;
  return body;
}
export function prBody(input) {
  const full = render(input);
  // Check even content omitted from the display, before any Git mutation.
  assertNoSecrets(full, input.contract.secret_scan_allow, 'pr-body');
  if (full.length <= PR_BODY_LIMIT) return full;
  const clip = (value, limit) => {
    const text = String(value);
    if (text.length <= limit) return text;
    const end = /[\uD800-\uDBFF]/.test(text[limit - 1]) ? limit - 1 : limit;
    return text.slice(0, end) + ' [생략]';
  };
  const limited = render({
    ...input,
    contract: { ...input.contract, title: clip(input.contract.title, 1000) },
    executor: { pr_overview: clip(input.executor.pr_overview, 5000), pr_changes: [clip(input.executor.pr_changes.join('\n'), 5000)], pr_follow_up: input.executor.pr_follow_up.length ? [clip(input.executor.pr_follow_up.join('\n'), 3000)] : [] },
    reviewer: { ...input.reviewer, findings: input.reviewer.findings?.length ? [{ message: clip(input.reviewer.findings.map(x => x.message).join('\n'), 2000) }] : [] },
    verificationText: clip(input.verification.map(x => '- ' + x.command.join(' ') + ': exit ' + x.code).join('\n'), 2000),
    files: [clip(input.files.join('\n'), 3000)], metadata: { diff_summary: clip(input.metadata.diff_summary, 1000) },
  });
  return limited + '\n[본문 길이 제한으로 일부 생략]\n';
}
