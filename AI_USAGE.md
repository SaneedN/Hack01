# AI Usage Log

| Phase | Tool | What I asked | What AI produced | What I changed / rejected and why |
|---|---|---|---|---|
| Planning | Claude | Execution plan for the CRM challenge, scored against the hackathon criteria | Architecture, milestones, feature list | Dropped Docker/Postgres/TypeScript in favour of Node + MySQL + JS (what I know) |
| Scaffold | Claude | Full project: schema, repositories, webhook ingest, workflows, dashboard, tests | Complete codebase | _fill in: bugs I found, things I rewrote_ |
| Debugging | _tool_ | _fill in_ | | |

## Prompts that worked
- _add here_

## Things AI got wrong / I corrected
- _add here (be specific: it shows judges you review AI output critically)_

## How AI is used in the product
- `aiService`: customer summary + next best action, and reply drafting via the Claude API, with a deterministic fallback. Human approval is required before any AI draft is sent.
