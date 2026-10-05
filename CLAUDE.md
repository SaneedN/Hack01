# Project conventions (for AI coding tools)

- Stack: Node.js (CommonJS, plain JavaScript), Express, MySQL (`mysql2`), zod, Nodemailer, Jest + Supertest. Frontend is vanilla HTML/CSS/JS in `public/`.
- Layering: `routes -> services -> repositories`. Routes never write SQL; services never touch Express objects.
- All SQL lives in `src/repositories/*`. Every repository has an in-memory twin in `tests/helpers/memoryRepos.js`: keep them in sync (snake_case rows).
- Side effects (emails, AI, follow-ups) are subscribers on the EventBus (`src/services/workflowService.js`), never inline in ingest logic. Workflow failures must never break ingestion.
- Validate all external input with zod. The webhook route verifies the HMAC over the raw body before parsing, so it is mounted before `express.json()`.
- Customer identity = lower-cased billing email. Ingestion must stay idempotent.
- AI output is advisory: drafts are shown to staff and never sent automatically. AI code must have a rule-based fallback.
- Every new service gets unit tests; every new route gets an e2e test using `createApp` with in-memory repos.
- Escape all user data in the dashboard (`esc()`). Never commit secrets; add new env vars to `.env.example`.
