# Approved policy sources

DEC-001 and `docs/11-MULTI-AGENT-ORCHESTRATION-POLICY.md` are the approval authority. This directory explains their implementation; it grants no additional permissions.

- `harness/tasks/<id>.json` supplies exact allowed / forbidden paths and verification commands. Corresponding Markdown Tasks (`docs/tasks/`) supply scope, dependencies, Gates, and acceptance criteria. Human reviews both; JSON cannot authorize a Markdown-forbidden change.
- `harness/schemas/` defines internal results and separate Codex strict transport schemas. Both Executor schemas require `handoff_actions`. Internal validation retains duplicate and empty-path checks absent from the transport schema.
- `harness/prompts/` supplies role templates. Agent outputs do not change permissions.
- Repository-wide exclusive lock, frozen run inputs, approval tied to stopped diff, cumulative changed paths, and the three-review total limit apply to Resume too.
- Git branch / commit / push / PR automation runs only when `harness/config.local.json` sets `git_automation: true`, after Human approval of the GitHub remote and Ruleset. Worktrees use an existing approved Task branch revision with `--detach`.
- AGENTS.md may change only when the contract permits it, and only to synchronize section 3 Current Task / Status from docs/07-TASKS.md (or sections listed in `agents_sections`). The Orchestrator only validates the edit with guardAgents and never writes AGENTS.md.
- Secret files and introduced secret-like content stop before Review. Redaction protects retained output; it is not permission to supply secrets.
