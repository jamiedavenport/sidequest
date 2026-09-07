# Finish Polar setup and test locally

Production products and the production webhook already exist. Do not recreate them.
Their IDs are in [billing-resources.production.json](billing-resources.production.json).
The webhook secret has already been uploaded to Cloudflare. Production product IDs
are in `wrangler.jsonc`, ready for deployment. Production migration `0002` is applied. Application deployment runs through CI on pushes
to `main`.

## 1. Finish sandbox authentication

Use the `polar-sandbox` MCP connection for development setup. If authentication is
needed, run this command and complete the browser authorization:

```sh
codex mcp login polar-sandbox
```

Start a fresh Codex session if the sandbox tools still do not appear.

Open [Polar Sandbox](https://sandbox.polar.sh) and select the existing organization
used by the configured Sidequest products. Sandbox accounts, organizations and tokens are
separate from production; do not reuse the production organization ID.

## 2. Create a sandbox organization token

In the sandbox organization's **Settings → Developers → New Token**, create an
organization access token. Set its expiration and select these application scopes:

```text
organizations:read
products:read
customers:read
customers:write
checkouts:read
checkouts:write
customer_sessions:write
subscriptions:read
subscriptions:write
orders:read
```

These are application permissions; provider administration uses the Polar MCP connection.
See [Polar's token instructions](https://polar.sh/docs/integrate/oat).

Edit the existing gitignored `.dev.vars`, preserving its authentication settings:

```dotenv
BETTER_AUTH_URL=http://localhost:3000
POLAR_SERVER=sandbox
POLAR_ORGANIZATION_ID=<sandbox organization ID>
POLAR_ACCESS_TOKEN=<sandbox token>
BILLING_CHECKOUT_ENABLED=false
BILLING_ENFORCEMENT_ENABLED=false
```

## 3. Start local development and a webhook tunnel

Apply pending local database migrations before starting development:

```sh
bun run db:migrate:local
bun run dev
```

The unpublished billing migration `0002` was regenerated in place. If your local database
already applied the earlier version, it retains unused inbox and scheduling fields; they do
not affect the application. Fresh databases use the simplified schema.

Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
if needed. In another terminal, start a tunnel and leave it running:

```sh
bun run billing:tunnel
```

Use the assigned HTTPS URL plus `/api/billing/webhook` as the sandbox webhook URL.
Keep `BETTER_AUTH_URL=http://localhost:3000` so login, checkout returns and portal
returns work while browsing locally. The tunnel's Host override lets Vite accept the webhook.

## 4. Configure the sandbox catalog and webhook

Use the sandbox Polar MCP connection to inspect and reconcile existing resources:

1. Inspect the organization and configured product IDs before creating anything.
   Reuse the existing monthly and annual products, including an annual product named
   **Sidequest Yearly**; a different display name does not require another product.
2. Verify fixed USD prices of 500 cents/month and 5,000 cents/year, interval count 1,
   explicit location-based tax behavior, and no provider trial. Set organization defaults
   to USD/location-based tax, disable multiple subscriptions, and set subscription proration
   to `next_period`. Organization-wide changes affect other products, so establish
   authorization before changing a shared organization.
3. Register or update the existing Sidequest raw webhook using the tunnel URL and
   the exact event list defined in `src/billing/webhook.ts`.
4. Read back the products, settings and webhook to verify configuration and avoid
   duplicate resources. If MCP does not expose a required operation, use the Polar
   dashboard for that setting.
5. Store the webhook signing secret in `POLAR_WEBHOOK_SECRET` in the gitignored
   `.dev.vars`. Set `POLAR_ORGANIZATION_ID`, `POLAR_MONTHLY_PRODUCT_ID` and
   `POLAR_ANNUAL_PRODUCT_ID` to the verified sandbox IDs, preserving other local keys.
   Never put tokens or signing secrets in resource JSON or source control.

Enable both local switches and restart `bun run dev`:

```dotenv
BILLING_CHECKOUT_ENABLED=true
BILLING_ENFORCEMENT_ENABLED=true
```

If the tunnel URL changes, use MCP to update the existing Sidequest webhook URL,
retaining its signing secret.

## 5. Exercise checkout, access and management

Visit `http://localhost:3000/billing`, sign in, and subscribe. Use card
`4242 4242 4242 4242`, a future expiry and any CVC, as documented in
[Polar's sandbox guide](https://polar.sh/docs/integrate/sandbox).

Verify that tax and the final total appear before payment, payment is immediate,
the return page leaves “Confirming payment”, and the paid-through date is shown.
Check the webhook delivery in the sandbox dashboard: the app should return `204`
after processing a supported verified event. Customer email testing requires an organization-member
email address (sub-address aliases are supported in Polar Sandbox).

Use another local account to test the other purchase interval. With a paid account,
switch intervals and verify the pending update takes effect at renewal without an
immediate charge. Check portal invoices, payment methods and cancellation at period end.
Test partial and full refunds, failed renewal/recovery, expiry and offline queued edits
using the [acceptance checklist](billing.md#launch-checklist). An old account's trial
is not reset when local enforcement is enabled.

Webhook processing failures return HTTP 500. Fix the underlying issue and replay the
failed delivery from the Polar dashboard. The application has no cron or background
retry queue. Use “Refresh payment status” on `/billing` to reconcile an account manually.

## 6. Complete production credentials and organization settings

Live **JXD (`jxd-ltd`)** has completed business verification and payout setup.
After the sandbox checklist passes, use the production Polar MCP connection to
inspect and reconcile the existing live products, webhook and organization settings.
Use the IDs in `billing-resources.production.json` and the application origin
`https://sdqst.app`.

Verify location-based tax defaults and `next_period` proration, which also governs portal
changes. Use the dashboard for settings the MCP connection cannot update. Confirm
checkout, renewal and payout capabilities are enabled before launching checkout.

The live organization token is already uploaded. To replace it, use the application scopes
above and Wrangler's interactive secret prompt:

```sh
bunx wrangler secret put POLAR_ACCESS_TOKEN
bunx wrangler secret list
```

The live webhook signing secret has already been uploaded. If it changes, update it
with `bunx wrangler secret put POLAR_WEBHOOK_SECRET`. Never upload `.dev.vars` to
production: it contains sandbox credentials and local authentication settings.

## 7. Deploy with billing disabled, verify delivery, then launch

Leave both switches in `wrangler.jsonc` false for the initial deployment. Commit and push
to `main`; `.github/workflows/ci.yml` runs validation, applies any pending D1 migrations,
and deploys the Worker. The already-applied billing migration is skipped automatically.

Verify the registered live webhook reaches the deployed route and that its signature
is accepted. Confirm the live organization, product IDs, API token and payout eligibility.
Only then enable `BILLING_CHECKOUT_ENABLED` in `wrangler.jsonc` and deploy again.
Enable `BILLING_ENFORCEMENT_ENABLED` separately when ready to enforce existing users'
original trial deadlines. No paid Polar platform upgrade is required by this setup.
