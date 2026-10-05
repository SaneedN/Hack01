# Woo CRM

A lightweight CRM integrated with WooCommerce. When a customer orders in the shop, the CRM automatically creates/updates the customer, stores the order and its status history, sends workflow emails, and lets staff track and communicate with customers, with optional AI summaries and reply drafting.

## Scope
**In scope:** customer management (search, profile, tags, notes), order tracking (history + status timeline, delayed-order detection), communication workflows (automatic emails + manual messages + history), dashboard, AI customer summary / next best action / reply drafting.

**Out of scope:** payments, inventory, multi-tenant support, staff login (planned), production deployment hardening.

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

## Setup (Windows / XAMPP / MySQL Workbench)
1. **Database:** open `database/schema.sql` in MySQL Workbench and run it (creates `crm_woocommerce` + tables).
2. **Config:** copy `.env.example` to `.env` and set `DB_PASSWORD` and `WOO_WEBHOOK_SECRET`.
3. **Install and run:**
   ```
   npm install
   npm run seed     # optional demo data
   npm run dev
   ```
4. Open http://localhost:3000 (dashboard) and http://localhost:3000/health/db.
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
| Method | Path | Description |
|---|---|---|
| POST | `/webhooks/woocommerce` | Signed Woo webhook receiver |
| GET | `/api/dashboard` | Stats, recent items, delayed orders |
| GET | `/api/customers?search=` | List/search customers |
| GET | `/api/customers/:id` | Profile + orders + messages + notes |
| PATCH | `/api/customers/:id/tags` | Set tags `{tags: []}` |
| POST | `/api/customers/:id/notes` | Add note `{note}` |
| POST | `/api/customers/:id/messages` | Send + log email `{subject, message}` |
| POST | `/api/customers/:id/ai-summary` | AI summary + next best action |
| POST | `/api/customers/:id/draft-reply` | AI draft (human approves before sending) |
| GET | `/api/orders?status=` | List orders |
| GET | `/api/orders/delayed?days=3` | Orders stuck in processing |
| GET | `/api/orders/:id` | Order + items + status timeline |

## Roadmap
Staff login/roles, initial sync via Woo REST API, delivery-delay follow-up emails, Docker Compose for one-command runs, deployment.
