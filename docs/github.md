# GitHub integration

Sidequest uses one GitHub App per environment for sign-in, account linking, repository access and webhooks. All REST calls use Better Auth’s encrypted, refreshable **user access token**. No App private key or installation JWT is used.

## Configured environments

| Environment | GitHub App                                                           | Application origin      | Credentials                       |
| ----------- | -------------------------------------------------------------------- | ----------------------- | --------------------------------- |
| Development | `sidequest-local`                                                    | `http://localhost:3000` | Local `.dev.vars`                 |
| Production  | [`sidequest-sdqst-app`](https://github.com/apps/sidequest-sdqst-app) | `https://sdqst.app`     | Secrets on the `sidequest` Worker |

Production uses the default configuration in `wrangler.jsonc`, not a named Wrangler environment. The four `GITHUB_*` settings are provisioned with `wrangler secret bulk --name sidequest --config wrangler.jsonc`; `BETTER_AUTH_URL` is set in the production configuration. Development uses separate credentials loaded from `.dev.vars`. The development webhook uses `https://tunnel.sdqst.app/api/github/webhook`, and the production webhook uses `https://sdqst.app/api/github/webhook`.

## App setup

Create a GitHub App at GitHub → Settings → Developer settings → GitHub Apps. Use a separate development App for each deployed environment.

- Homepage: the environment’s `BETTER_AUTH_URL`.
- Callback: `https://<host>/api/auth/callback/github`.
- Setup URL: `https://<host>/`. Enable redirecting to the setup URL after installation and repository access updates. The browser restores the open lane modal from session storage. Installation callback parameters never establish access.
- Leave “Request user authorization (OAuth) during installation” off: account authorization and installation are separate steps in the modal.
- Enable expiring user access tokens. Keep the generated client secret server-side.
- Repository permissions: **Issues: Read and write**, **Metadata: Read**.
- Account permissions: **Email addresses: Read** (including private primary emails).
- Subscribe to **Issues** events. Installation creation and repository additions also trigger imports for configured lanes. Repository access is checked before each import or closure.
- Webhook URL: `https://<host>/api/github/webhook`, active, with a random webhook secret. Keep SSL verification enabled.
- Allow installation on other accounts if users need organization repositories. Organization owners may need to approve installation or permission changes.

Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_SLUG` and `GITHUB_WEBHOOK_SECRET`. Local development reads `.dev.vars`; the examples are in `.dev.vars.example`. Set deployed secrets with `bunx wrangler secret put <NAME>`. Set `BETTER_AUTH_URL` to the exact environment origin. Keep `BETTER_AUTH_SECRET` stable: it encrypts OAuth tokens as well as protecting sessions. Email sign-in remains available when GitHub is unconfigured.

The migration adds Better Auth 1.7.2’s required account issuer column, a unique issuer/subject identity, and one GitHub account per Sidequest user. Implicit linking retains both provider and local verified-email checks. Different emails are accepted only by authenticated `linkSocial` flows.

## Cloudflare setup

Apply the checked-in migration locally with `bun run db:migrate:local`, and to the target D1 database with `bun run db:migrate:remote` when deploying. The integration uses the existing Worker and Board Durable Object bindings. It has no queue or alarm configuration.

For local GitHub testing, run `bun run dev` and `bun run dev:tunnel` in separate terminals. Browse Sidequest at `http://localhost:3000`; the named tunnel only forwards webhook requests to local port 3000. Set `BETTER_AUTH_URL=http://localhost:3000` in `.dev.vars` and use these development App URLs:

- Homepage and setup: `http://localhost:3000/`.
- Callback: `http://localhost:3000/api/auth/callback/github`.
- Webhook: `https://tunnel.sdqst.app/api/github/webhook`.

Keep sign-in, OAuth callbacks and installation redirects on localhost so the session, OAuth state and lane return destination belong to that same origin. If the development App previously used the tunnel for its homepage, callback or setup URL, update those fields in its GitHub settings; keep the webhook URL above. Restart the dev server after changing environment settings. See [Local development tunnel](local-tunnel.md) for configuration and startup details.

## Behavior and manual retries

Connect a custom lane through its **GitHub** menu. Connect the account, install or adjust repository access, refresh repositories, select filters and save. Only repositories with the App’s Issues write permission and the user’s triage/write/maintain/admin permission are offered. Archived repositories and repositories with issues disabled are excluded.

Saving settings imports matching open issues directly, one page at a time. **Sync now** runs that import again. Installation and repository-addition webhooks import existing issues for configured connections; issue webhooks import the affected issue. An installation can happen before a lane is configured, so saving settings also triggers the initial import. Label filters require every selected label; assignment filtering defaults off. Filters admit new tasks only, and GitHub updates never overwrite an imported task.

GitHub requests run outside the board’s serialized writes. Each fetched page rechecks that the connection is still active and billing permits writes before applying a batch. Imports use stable task IDs and a small persisted marker per issue to avoid duplicates and remember deleted tasks. There is no import journal, persisted cursor, scheduled reconciliation, or automatic retry.

Completing a linked task through the UI or MCP persists the task first, then makes one attempt to close the GitHub issue. Parent completion includes linked descendants. An already closed issue keeps its closure reason. A failed closure leaves the local task completed and logs `github.closure_failed`; close the issue on GitHub or mark the task incomplete and complete it again to retry. Disconnecting or deleting a lane prevents new work for that connection; requests already sent to GitHub may still finish.

Webhook responses wait for the direct imports to finish. Failed imports return HTTP 502 and log `github.webhook_failed` with the delivery identifier. GitHub requires a response within 10 seconds and does not automatically redeliver failed webhooks. Large imports, network failures, and process interruptions can leave partial results. Use **Sync now** to retry missing imports, or redeliver the webhook from the GitHub App’s Recent deliveries page. A failure before an import marker is saved can also lose deletion history; this design accepts that small crash window.

The modal reports connection status and errors from manual requests. It does not poll background progress. There is no guarantee that a closure survives a process restart, and billing or access failures require a manual retry once resolved.

## Release checks requiring a configured App

Exercise GitHub sign-up/sign-in (including private email), verified-email account linking, explicit linking with a different email, cancelled authorization, token refresh, and a login that returns to MCP authorization. Check returning to the same lane modal after linking and installation.

Verify public/private repositories, organization approval, more than 100 issues, all-label and assignment filters, webhook admission and live updates in another browser. Complete linked tasks through UI, MCP and parent completion. Test manual retry after a transient failure, task movement/deletion, lane disconnect during an import, revoked access and billing restrictions. Confirm no new task appears from a duplicate delivery and a manually closed issue keeps its existing closure reason.

Automated regressions cover idempotent manual retries, deleted-issue markers, direct pagination, concurrent disconnect/billing changes, one-shot closures, webhook completion/failure, and server-owned attachment identity. They use simulated GitHub responses; successful local checks do not establish that the App is correctly configured.

Documentation checked: Context7 `/better-auth/better-auth` requested for installed **1.7.2**, cross-checked against installed source; `/websites/github_en_rest`; `/websites/developers_cloudflare_durable-objects`; `/tanstack/db` requested for installed **0.8.6**, cross-checked against installed transaction types. Effect references use installed **4.0.0-rc.112** `AGENTS.md`, `ai-docs` and source. See [Better Auth GitHub](https://better-auth.com/docs/authentication/github), [GitHub user installation access](https://docs.github.com/en/rest/apps/installations), [webhook events](https://docs.github.com/en/webhooks/webhook-events-and-payloads), and [Durable Object concurrency](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/), and [GitHub failed deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries).
