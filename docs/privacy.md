# Privacy policies and consent

The implementation uses PolicyStack V1 (`@policystack/sdk`, `core`, `react` and `cli` pinned to 1.5.0). `src/policystack.ts` is the shared configuration. Public `/privacy` and `/cookies` routes use the same owned TSRX renderers; the OAuth `/consent` route is unrelated.

Context7 reference: `/jamiedavenport/policystack`, requested V1; verified against installed 1.5.0 declarations and runtime. The [custom React renderer documentation](https://policystack.dev/docs/policy/react) describes the `components` prop. PolicyStack validation is `bun run privacy:validate`.

## Publication review still required

These pages are implemented for review, not approved for publication. The effective date is 7 September 2026; change it to the actual publication date if different. Business details come from the approved plan: JXD Ltd trading as Sidequest, `https://sdqst.app`, 86–90 Paul Street, London, EC2A 4NE, United Kingdom, `x@jxd.dev`, UK and EEA.

The repository does not establish the following operational facts. Complete them before publishing:

- Confirm the DPO assessment and EEA representative applicability, recording the rationale or adding appointed contacts to the config. The [ICO DPO guidance](https://ico.org.uk/DPOs) explains the assessment; [ICO guidance on receiving EEA data](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/receiving-personal-information-from-the-eea/) addresses EEA arrangements. No exemption is asserted here. Validation deliberately retains `company-dpo-undeclared` until this is resolved.
- Confirm actual Cloudflare D1/Durable Objects recovery windows, Workers/request log settings, and deletion procedures. `wrangler.jsonc` enables observability but does not specify provider retention. Review the account’s applicable [Cloudflare privacy terms](https://www.cloudflare.com/privacypolicy/) and processing agreement.
- Confirm Resend email-content, delivery-log and suppression-list retention, plus the agreement applying to the account. Its public [DPA](https://resend.com/legal/dpa) describes EU and UK contractual clauses; this does not verify Sidequest’s executed agreement or settings.
- Confirm Polar’s merchant-of-record responsibilities, customer/billing records and applicable tax retention. Its [privacy policy](https://polar.sh/legal/privacy-policy) describes retention by service needs and legal obligations; Sidequest’s transaction requirements still need operator confirmation.
- Confirm OpenPanel project hosting location, raw-event/IP processing, retention, deletion procedures, subprocessors and transfer arrangements. The [public privacy notice](https://openpanel.dev/privacy) is not proof of project-specific settings.
- Review whiteboard licensing diagnostics on production HTTPS: installed tldraw 5.4.0 `LicenseManager.ts` can send `window.location.href` for unlicensed, evaluation or watermarked production states. This pre-existing behaviour is independent of OpenPanel and is not exercised by localhost. Confirm the production licence and privacy treatment before making any application-wide claim that all analytics is opt-in.
- Record each provider’s actual processing countries and applicable transfer mechanism, together with any required assessments. Replace the neutral transfer contact wording with verified specifics. Confirm rsms.me and tldraw CDN hosting arrangements as part of this review.
- Confirm the mailbox workflow for access, correction, portability, restriction, objection and erasure requests, including identity checks and fulfilment across processors. The app has no self-service account-deletion feature.

`src/privacy/dictionary.ts` replaces PolicyStack’s unverified default DPO-exemption statement and generic assertions that particular transfer safeguards are already in place. It preserves rights and contact information while those facts are reviewed.

Retention uses purpose-based criteria. Credential expiry is not a claim that database rows, logs or backups are automatically deleted. No cleanup schedules or database migrations were introduced.

## Storage evidence

Observed in local Chromium against the E2E app on 7 September 2026: `better-auth.session_token` (HTTP-only, seven-day expiry), `sidequest-consent`, IndexedDB `offline-transactions`, and OPFS `sidequest-board-<account ID>.sqlite` with WAL/journal files and an access-handle pool directory. Rejecting analytics did not remove or disable necessary storage. No OpenPanel browser cookie or persistent identifier was created after opt-in.

The rendered inventory includes the following source-verified cases beyond that observed browser path:

| Storage                     | Evidence and duration                                                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPS authentication prefix | Better Auth 1.7.2 `dist/cookies/index.mjs`: `__Secure-` on HTTPS; session default in `dist/context/create-context.mjs` is seven days, renewable during use. Cookie cache is not enabled, so `session_data` is not an active cookie.      |
| OAuth logout confirmation   | `@better-auth/oauth-provider` 1.7.2 `authorize-*.mjs`: session-cookie name plus `.oauth_logout_confirmation`, 300-second lifetime, consumed by the confirmation flow. Not observed in the normal login/board path.                       |
| Offline SQLite files        | `src/board/sync/client.tsrx`: account-specific OPFS database. No local cleanup on sign-out or time-based expiry.                                                                                                                         |
| Offline outbox              | Account-scoped IndexedDB `sidequest-outbox-v2-<account ID>`, store `transactions`; fallback `sidequest-outbox-v2-<account ID>:*` localStorage. Pending mutations remain until processing/removal. The empty database itself may persist. |
| Whiteboard preferences      | tldraw 5.4.0 `TLUserPreferences.ts`: `TLDRAW_USER_DATA_v3` is written when preferences are saved, with no automatic expiry. Its asset configuration requests `cdn.tldraw.com`.                                                           |
| Consent                     | `src/privacy/storage.ts`: browser-local `sidequest-consent`, valid for 180 days; older records cannot authorise analytics even if the stored bytes remain.                                                                               |
| Analytics                   | `src/lib/use-analytics.ts` uses `@openpanel/web` 1.4.1 to send page views. It does not identify users or write persistent analytics storage; automatic tracking and replay are disabled.                                                 |

Repeat the inventory on production HTTPS, including actual sign-in, OAuth logout confirmation, whiteboard preference changes, hosted checkout, and any edge-added storage before publishing. Provider-hosted checkout storage is governed by Polar’s notice.

## Runtime decisions

One PolicyStack provider owns the app’s consent state. Necessary storage stays enabled under the service contract. With no location resolver, the consent model is opt-in for every visitor. SSR renders with analytics disabled. Preferences use PolicyStack’s draft and save actions; cancellation discards the draft.

The storage adapter catches browser storage failures and validates records. Analytics relies on PolicyStack’s `has("analytics")` before loading and each send. Missing, invalid, expired or inaccessible storage cannot restore consent; an explicit choice can still apply in memory if it cannot persist. Cross-tab updates, clearing site storage, focus, visibility changes and a one-minute expiry check update PolicyStack’s state. PolicyStack V1 ignores null incoming records, so removal is represented internally as an invalidated record to trigger re-consent. That marker is never written as an accepted decision.

Re-consent includes both computed policy hashes and a custom-disclosure revision. Material edits to `dictionary.ts` or the inventory must increment the suffix on `cookieVersion` in `src/policystack.ts` because these documents are outside the SDK’s hash inputs.

`RootLayout` mounts one `PrivacyNotification` beside its `Outlet`, runs browser consent synchronisation, and calls `useAnalytics`. The PolicyStack provider sits in the root document, so all routes share the same notification, preferences and consent state.

`useAnalytics` reads committed consent and the resolved route pathname through React hooks. One effect dynamically imports and creates the OpenPanel web client when saved analytics consent is valid. Its cleanup stops new events, clears identity state and releases the client. A second effect calls the SDK’s `screenView()` for `/`, `/billing` or `/connections`. Draft changes and query-string changes do not send another event. Renewed consent starts a fresh client and records only the current eligible page.

The SDK’s automatic page tracking, outgoing-link tracking, attribute tracking and session replay are disabled. The app supplies the pathname explicitly and the SDK uses the page’s static document title. Its referrer property is cleared through `setGlobalProperties`; browser requests may still include the site origin in the HTTP Referer header, but no page path or query string. A consent filter checks the current grant before SDK events are dispatched. No transport or SDK methods are overridden.

The SDK does not expose a destroy method or cancellation for its transport. Cleanup prevents new app events, but requests already underway, including automatic retries, may finish after withdrawal. This is the tradeoff of using the SDK’s standard lifecycle rather than a custom transport. Server rendering creates no client and sends no events.

Reference: [OpenPanel’s web SDK documentation](https://openpanel.dev/docs/sdks/web), checked against installed `@openpanel/web` 1.4.1 and `@openpanel/sdk` 1.3.1. Context7 library `/websites/openpanel_dev` was consulted for the current API documentation.

## Verification

- `bun run privacy:validate`: zero errors; the intentional DPO warning remains.
- Repository formatter, linter and type checker pass.
- `bun run test`: 21 files, 257 tests pass, including two focused consent-storage regressions.
- `E2E_BUILT_WORKER=1 bunx playwright test e2e/privacy.e2e.ts e2e/billing.e2e.ts`: seven Chromium tests passed before the subsequent UI refinements; the three privacy tests pass after this refactor against the built Worker. These cover signed-out access and navigation, mobile overflow, heading hierarchy, policy lists/tables, dialog dismissal, persistence and cross-tab withdrawal/deletion, expired consent, actual fixed-payload analytics requests, billing redirects and offline task persistence/recovery.
- The production build passes with the existing large-chunk advisory.

Actual email delivery, production HTTPS/provider storage, real checkout, organisational DPO/representative applicability and provider account settings were not verified. The browser tests use an isolated local session helper and intercept OpenPanel requests; no analytics events or payments are sent to live providers during those tests. The remaining E2E suites were not run as part of this change.

## Account isolation rollout

Client and server ship together with sync protocol version 2; older clients must reload. Each account has its own outbox and leader-election namespace. Signing out, session expiry and account switching preserve pending edits; signing back into that account resumes them. If persistent outbox storage cannot initialize, the board shows a Retry action and does not accept edits.

Legacy unowned data remains untouched: IndexedDB database `offline-transactions`, object store `transactions`, and localStorage keys beginning `offline-tx:`. These locations are excluded from replay. For manual recovery, export them through browser developer tools and establish ownership independently; the next login does not establish ownership. Existing account-scoped SQLite files are unchanged.

WebSocket sessions are checked against D1 at each operation and application delivery, including server broadcasts. Idle sockets need no polling. Revocation does not roll back operations already authorized and in flight. Authentication failures close with 4401; database-check failures close with 1011 and permit retry. Session IDs and credentials are never logged.

References: Context7 `/tanstack/db`, requested `@tanstack/offline-transactions` 1.0.52, verified against installed source; `/websites/developers_cloudflare_durable-objects`, compatibility date 2026-08-29 and Wrangler 4.127.1.
