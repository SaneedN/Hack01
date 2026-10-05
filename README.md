# Woo CRM

A lightweight CRM integrated with WooCommerce. When a customer orders in the shop, the CRM automatically creates/updates the customer, stores the order and its status history, sends workflow emails, and lets staff track and communicate with customers, with optional AI summaries and reply drafting.

## Scope
**In scope:** customer management (search, profile, tags, notes), order tracking (history + status timeline, delayed-order detection), communication workflows (automatic emails + manual messages + history), dashboard, AI customer summary / next best action / reply drafting.

**Out of scope:** payments, inventory, multi-tenant support, production deployment hardening (rate limiting beyond login, HTTPS termination).

## Assumptions
- A customer is identified by **billing email (case-insensitive)**; guest checkouts are supported.
- WooCommerce is the source of truth for orders; the CRM owns notes, tags and communications.
- Webhooks can be duplicated, so ingestion is **idempotent**.
- Default WooCommerce has no "Shipped" status, so **Completed** triggers the shipping email.
- With no `SMTP_HOST`, emails are *simulated* (logged in the CRM, nothing sent). With no `ANTHROPIC_API_KEY`, AI falls back to rule-based output.

## Architecture
```
WooCommerce --webhook (HMAC signed)--> routes/webhooks
                                           |
                                    OrderIngestService --> repositories --> MySQL
                                           |
                                       EventBus
                          order.created / order.status_changed
                                           |
                                   workflowService --> emailService (Nodemailer)
                                           |               |
                                           +--> communications table

Dashboard (public/) --> /api/* --> routes --> repositories
                                      +--> aiService (Claude API or rule-based fallback)
```
Layers: `routes -> services -> repositories`. Patterns: **Repository** (MySQL + in-memory twins for tests), **Observer** (EventBus), **Strategy** (SMTP vs simulated email, Claude vs rules AI), **Dependency injection** (`createApp(deps)`).

## What's new in v2
| Feature | What it does | Where |
|---|---|---|
| **Staff login + roles** | JWT login (scrypt-hashed passwords, no extra deps). `admin` can manage users and run sync/automation; `staff` works customers, orders, triage, tasks. Login is throttled. | `services/authService`, `middleware/auth`, `routes/auth` |
| **AI triage agent** | Claude tool-use loop reads a customer message, calls tools (`get_customer_orders`, `get_order_details`), then submits category, urgency, summary, draft reply and a suggested task. **Staff approve/edit before anything is emailed.** Falls back to a rules agent without an API key. | `services/triageAgent`, `routes/triage` |
| **Woo sync** | Admin button imports existing orders/customers through the WooCommerce REST API. Uses a silent event bus, so no historical emails. Idempotent. | `services/wooClient`, `services/wooSyncService` |
| **Delayed-order automation** | Scheduler (and admin "run now") emails customers with orders stuck in *processing* once, logs it, and opens a staff task. | `services/followUpService` |
| **Dashboard polish** | 14-day revenue chart, status breakdown, customer segments (VIP / at-risk / new / regular), filters, sorting, pagination, tasks view. | `services/analyticsService`, `public/` |
| **CI + Docker** | GitHub Actions runs tests on Node 20/22 and builds the image; `docker compose up` runs app + MySQL. | `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml` |

**Segments:** *vip* = 3+ orders or 10,000+ spent; *at-risk* = no order in 30+ days; *new* = one order; *regular* = the rest.

### Upgrading an existing database
Re-run `database/schema.sql` in MySQL Workbench: it only adds the new `tasks` and `triage_items` tables (`users` already existed). Then add `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` to `.env` and restart; the first admin is created automatically.

### Run with Docker
```
copy .env.example .env    # then set JWT_SECRET, ADMIN_PASSWORD (and DB_PASSWORD)
docker compose up --build
```
Open http://localhost:3000 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### Deploy a hosted demo
Any Docker host works (Render, Railway, Fly.io). Use a managed MySQL, run `database/schema.sql` once, set the env vars from `.env.example`, and point the WooCommerce webhook at `https://<your-host>/webhooks/woocommerce` (no local-address workaround needed).

## Setup (Windows / XAMPP / MySQL Workbench)
1. **Database:** open `database/schema.sql` in MySQL Workbench and run it (creates `crm_woocommerce` + tables).
2. **Config:** copy `.env.example` to `.env` and set `DB_PASSWORD`, `WOO_WEBHOOK_SECRET`, `JWT_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
3. **Install and run:**
   ```
   npm install
   npm run seed     # optional demo data
   npm run dev
   ```
4. Open http://localhost:3000, sign in with the admin credentials, and check http://localhost:3000/health/db.
5. **Tests:** `npm test`

## Connect WooCommerce
1. WooCommerce -> Settings -> Advanced -> Webhooks -> Add webhook (create two: topic **Order created**, topic **Order updated**).
2. Delivery URL: `http://127.0.0.1:3000/webhooks/woocommerce`
3. Secret: same as `WOO_WEBHOOK_SECRET` in `.env`. Status: Active.
4. **Local gotcha:** WordPress blocks webhook calls to local addresses/odd ports. Create `wp-content/mu-plugins/allow-crm.php`:
   ```php
   <?php
   add_filter('http_request_host_is_external', '__return_true');
   add_filter('http_allowed_safe_ports', function ($ports) { $ports[] = 3000; return $ports; });
   ```
5. Place a test order: the customer appears in the CRM and a confirmation email is logged. Mark it **Completed**: the shipped email is logged.

## API
All `/api/*` routes need `Authorization: Bearer <token>` (from `POST /api/auth/login`) except login itself. 🔒 = admin only.

| Method | Path | Description |
|---|---|---|
| POST | `/webhooks/woocommerce` | Signed Woo webhook receiver (public, HMAC-verified) |
| POST | `/api/auth/login` | `{email, password}` -> `{token, user}` |
| GET | `/api/auth/me` | Current user |
| GET/POST | `/api/auth/users` 🔒 | List / create staff `{name, email, password, role}` |
| GET | `/api/dashboard` | Stats, chart data, segments, delayed orders, queue counts |
| GET | `/api/customers?search=&segment=&sort=&page=&pageSize=` | Paginated list with segment |
| GET | `/api/customers/:id` | Profile + orders + messages + notes |
| PATCH | `/api/customers/:id/tags` | Set tags `{tags: []}` |
| POST | `/api/customers/:id/notes` | Add note `{note}` |
| POST | `/api/customers/:id/messages` | Send + log email `{subject, message}` |
| POST | `/api/customers/:id/ai-summary` | AI summary + next best action |
| POST | `/api/customers/:id/draft-reply` | AI draft (human approves before sending) |
| GET | `/api/orders?status=&search=&page=&pageSize=` | Paginated orders |
| GET | `/api/orders/delayed?days=3` | Orders stuck in processing |
| GET | `/api/orders/:id` | Order + items + status timeline |
| GET/POST | `/api/triage` | List pending / run the triage agent `{message, customerId? or email?}` |
| POST | `/api/triage/:id/approve` | Send the (optionally edited) draft `{body?, subject?}`, create the task |
| POST | `/api/triage/:id/reject` | Discard |
| GET/POST | `/api/tasks`, `/api/tasks/:id/complete` | Staff to-dos (manual, automation, triage) |
| POST | `/api/admin/sync/woocommerce` 🔒 | Import existing orders via Woo REST API |
| POST | `/api/admin/automation/followups` 🔒 | Run the delayed-order follow-up now |

## Roadmap
Per-user audit log, password reset, refresh tokens, webhook retries queue.
