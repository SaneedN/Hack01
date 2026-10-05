# AI Usage Log

| Phase | Tool | What I asked | What AI produced | What I changed / rejected and why |
|---|---|---|---|---|
| Planning | Claude | Execution plan for the CRM challenge, scored against the hackathon criteria | Architecture, milestones, feature list | Dropped Docker/Postgres/TypeScript in favour of Node + MySQL + JS (what I know) |
| Scaffold | Claude | Full project: schema, repositories, webhook ingest, workflows, dashboard, tests | Complete codebase | _fill in: bugs I found, things I rewrote_ |
| Debugging | _tool_ | _fill in_ | | |
| v2 upgrade | Claude | Add login/roles, AI triage agent, Woo sync + delayed-order automation, CI/Docker, dashboard polish in one pass | JWT auth, tool-use triage agent, sync/follow-up services, tests, workflow, Dockerfile/compose, new UI views | _fill in: what I reviewed, changed or rejected_ |

## Prompts that worked
- _add here_

## Things AI got wrong / I corrected
- _add here (be specific: it shows judges you review AI output critically)_

## How AI is used in the product
- `aiService`: customer summary + next best action, and reply drafting via the Claude API, with a deterministic fallback. Human approval is required before any AI draft is sent.
- `triageAgent`: Claude tool-use loop (read-only lookup tools + a `submit_triage` tool). Output is queued as pending and a human approves or edits before any email goes out. A rules agent performs the same lookups when there is no API key or the API fails.
