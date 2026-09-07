# Subscription billing

Sidequest uses Polar as merchant of record, with the official `@polar-sh/sdk` pinned to
`0.49.0`. Documentation was queried through Context7 library `/websites/polar_sh`
(no versioned documentation ID was available); installed SDK types are the API reference
for the implementation. Prices are $5/month and $50/year USD, with location-based tax inclusion. Both products have identical features, no Polar trial, and no discount codes.
The application trial ends exactly 14 days after the existing `user.created_at` value.
Purchasing starts the paid period immediately.

## Current setup status

Production organization **JXD (`jxd-ltd`)** was confirmed by the owner on 2026-09-07.
The production MCP created and read back **Sidequest Monthly** ($5/month USD) and
**Sidequest Annual** ($50/year USD), both private, with location-based tax and without trials.
It also created and verified the raw billing webhook at
`https://sdqst.app/api/billing/webhook` with all 11 application events.
Exact IDs are in [billing-resources.production.json](billing-resources.production.json).

The webhook signing secret is stored in the gitignored, mode-600
`.dev.vars.polar-production` file and was uploaded to Worker `sidequest` with
`wrangler secret bulk`; `wrangler secret list` confirmed the binding exists.
The production organization/product IDs are in `wrangler.jsonc` for the next deployment.
Production migration `0002` was applied on 2026-09-07. Application deployment runs through
CI on pushes to `main`.
Production checkout and enforcement remain disabled. The unpublished billing migration
`0002` was regenerated without the inbox and reconciliation scheduling fields. Local databases
that already applied its earlier version retain those unused fields; the application no longer
uses them.

Production onboarding is complete: the organization is active, its payout account is
connected, and checkout, renewal, payout and refund capabilities are enabled. Subscription
proration is `next_period`, multiple subscriptions are disabled, and the organization tax
default and both product prices use `location`. The application API token and webhook
secret bindings exist in Cloudflare.

## Architecture

`src/billing` owns the access projection, catalog validation, SDK operations, webhook
processing, authenticated server functions and the board route access check. User IDs come from
Better Auth sessions, and MCP subjects come from validated OAuth tokens. Browser
billing mutations require the configured application origin. Product selection,
customer identity, currency, and return URLs are resolved on the server.

Database access uses Drizzle's typed schema and query builder through `createDatabase`.
Conditional upserts and aggregates use schema-referenced SQL expressions
inside Drizzle queries. Unit tests run the same D1 driver against SQLite with the real
migrations. The interval enums only constrain TypeScript; they do not change the database.

The user's existing Board Durable Object serializes checkout, interval changes,
reconciliation and webhook processing. Its owner binding is checked against the
Durable Object ID. A D1 checkout attempt is recorded before provider creation; after
an uncertain response, retries inspect provider sessions and reuse them. An unresolved
attempt blocks new creation for one hour. The provider's duplicate-subscription setting
is also required, and existing subscribers are directed to management. An open checkout
can change between the two approved products without creating another session.

Only a paid order with the expected product, currency, amount, customer, subscription,
and billing period establishes a paid grant. The listed amount may match the order net
amount (tax added) or total amount (tax included); full refunds are compared with the
net amount, independently of refunded tax. Subscription status and customer-state
webhooks alone do not prove payment. Historical order reads are never applied to newer
unpaid subscription periods. Verified order webhooks retain their original period;
reconciliation can recover evidence for the current period. Historical missing grants
whose exact period cannot be proven require operator review rather than guessed dates.
A fully refunded latest period revokes its grant; a partial refund retains it. Provider
revocation overrides paid/grace access. Cancellation has no grace; an unconfirmed or
failed renewal has exactly 72 hours after the last confirmed paid period.

The webhook endpoint verifies the original request bytes and processes supported events
through the user's Durable Object before returning HTTP 204. Processing failures return
HTTP 500 and log the delivery ID, so failed deliveries can be replayed from the Polar
dashboard. Duplicate and reordered events remain safe through idempotent order/subscription
upserts and modified-at checks. There is no durable inbox, retry worker or cron.
Provider reconciliation runs during webhook processing, checkout and explicit billing
status refreshes; it is not scheduled.

The board route checks access on the server before loading and redirects expired or
revoked accounts to `/billing` when enforcement is enabled. Already-open boards do not
poll billing or track expiry locally. WebSockets check access before every mutation;
a billing rejection redirects the browser to `/billing` and remains retryable in the
durable offline outbox with its original idempotency key. Returning to the board after
access is restored reloads pending edits and resumes synchronization. Transient
access-check failures also remain retryable. MCP independently rejects writes without
access. Offline users can continue drafting until they reconnect.

## Provider setup and read-back

1. Establish the Sidequest organization and MCP environment. Use `search_tools`, then
   `describe_tools`, before calling Polar MCP operations. Inspect organization settings,
   products and existing webhook endpoints, redacting signing secrets from output.
2. Use sandbox first. Create/reconcile **Sidequest Monthly** and **Sidequest Annual**,
   with recurrence `month`/`year`, count 1, fixed `usd` prices 500/5000, explicit price tax
   behavior `location`, and null provider trials. Private visibility keeps products out
   of the public catalog while application checkout remains disabled.
3. Set organization subscription proration to `next_period`, disallow multiple
   subscriptions and use location-based tax/USD defaults. Portal plan changes inherit this
   organization policy. Do not alter settings of an organization shared with unrelated
   products without establishing authorization for those organization-wide settings.
   Hosted portal sessions return to `/billing`; checkout returns to `/billing?confirming=1`.
   Application interval changes explicitly use `next_period`. Portal cancellation
   retains access to the end of the paid period.
4. Register a raw webhook at `/api/billing/webhook` for the exact event list defined
   in `src/billing/webhook.ts` (paid/updated/refunded orders, customer state and
   subscription created/updated/active/canceled/uncanceled/revoked/past_due events).
   The pinned SDK does not parse `subscription.cycled`; `subscription.updated` and
   paid orders cover renewal changes, with explicit status refresh available as needed.
5. Read every changed resource back. Verify amount, recurrence, currency, tax, null
   trials, URLs, events and duplicate-resource counts. Record non-secret IDs in
   `docs/billing-resources.sandbox.json` or `.production.json` and environment bindings.
   Use `http://localhost:3000` for local app returns and a reachable sandbox deployment
   or HTTPS tunnel for webhook delivery. Live origin is `https://sdqst.app`.

Provider administration uses the Polar MCP connection; application requests use the
SDK. Reuse existing product IDs even when their display names differ, and update the
existing sandbox webhook when a development tunnel URL changes. If MCP lacks a
required setting operation, complete that setting in the Polar dashboard.
Store local credentials in the gitignored `.dev.vars`. For deployed environments,
use `wrangler secret put POLAR_ACCESS_TOKEN` and
`wrangler secret put POLAR_WEBHOOK_SECRET`. Record only non-secret IDs and URLs in
resource JSON and environment configuration. Never put secrets in command arguments.

## Launch checklist

- Run sandbox purchase for each interval, confirming immediate charging and tax shown
  before payment. Verify portal invoices/payment methods, cancellation at period end,
  interval changes at renewal with no proration, renewal failure/recovery, partial/full
  refunds, revoked subscriptions, duplicate/reordered deliveries, and manual replay after failure.
- Validate webhook delivery against a reachable sandbox deployment. A local HTTP
  server alone cannot receive Polar's remote webhook requests.
- Keep independent sandbox/live D1 and Durable Object deployments and credentials.
  Do not point production customer mappings at sandbox products or switch an existing
  billing database to another provider environment.
- Complete live business verification, bank/payout setup and Starter eligibility.
  No paid platform upgrade is part of this setup. Complete sandbox validation before
  configuring live billing through MCP.
- Apply D1 migrations (`bun run db:migrate:remote`) and deploy webhook handling with both
  switches false. Migration `0002` creates the billing tables without an inbox or reconciliation
  scheduling fields. Configure the live IDs and secrets. Verify the exact live catalog and a
  delivered webhook before changing either switch.
- Enable `BILLING_CHECKOUT_ENABLED` only after launch checks. Enable
  `BILLING_ENFORCEMENT_ENABLED` separately, acknowledging existing accounts whose
  original 14-day trial has already expired. The checkout path verifies catalog,
  organization policy and live account capabilities before offering checkout.
- Roll back either switch independently. Keep webhook processing
  enabled; preserve billing and board data.

## Operations

Monitor `billing.webhook_failed` logs and failed webhook deliveries in the Polar dashboard.
After fixing a failure, replay the delivery from that dashboard. Successful processing
returns HTTP 204; processing failures return HTTP 500. The application does not keep
webhook payloads or schedule retries.

Investigate prolonged “Confirming payment” using the checkout attempt, paid order,
confirmed period and the provider's delivery history. The billing page's refresh action
can fetch current provider state. No event payload, access token, checkout client secret
or webhook secret belongs in logs.

## Validation

Vitest exercises deadline boundaries, evidence, refunds, reordered/duplicate events,
origin checks, checkout recovery, product/account isolation,
interval changes and server access deadlines. Playwright covers server redirects,
mobile billing, spoofed checkout returns, existing-socket expiry and queued offline-edit
recovery across billing redirects.
These are local application tests; they do not replace the live Polar sandbox checklist.

Local verification on 2026-09-07: 252 Vitest tests passed; 8 Playwright tests passed
against the built Worker (billing, live sync and MCP), followed by a passing rerun of
the 4 billing browser tests after the final UI change. Formatting, lint, TypeScript,
Effect diagnostics, schema drift check, production build and deployment dry run passed.
Build output retains the project's large-chunk warning. No remote migration or deployment
was run, and no Polar sandbox/live payment was performed.

Provider-setup follow-up on 2026-09-07: 53 focused billing tests, formatting, lint,
TypeScript/Effect diagnostics, production build and Wrangler deployment dry run passed.
MCP read-back confirmed
exactly one monthly product, one annual product and one live billing webhook in JXD.
The live webhook secret binding exists in Cloudflare; completed payment flows remain
untested. Subsequent sandbox checkout fixes passed 60 focused billing tests and
verified the local redirect to hosted checkout.

Location-based tax verification on 2026-09-07: 255 unit tests and 6 billing/MCP browser
tests passed, along with formatting, lint, Knip, TypeScript/Effect checks, the production
build and deployment dry run. A real sandbox monthly checkout charged $5 including
$0.83 tax ($4.17 net); signed webhooks returned 204 and restored an expired account's
board access. A full sandbox refund revoked its grant. The test subscription was
canceled and the temporary webhook deleted. No live payment was made.

Both production products now use location-based tax. Checkout and enforcement remain
false in `wrangler.jsonc`; enabling them is a separate rollout step. The first direct
Worker upload failed before deployment; use the existing CI workflow for deployment.
